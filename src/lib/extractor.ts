import { chromium } from "playwright";

const MAX_MAIN_TEXT_LENGTH = 4000;

type RawExtract = {
  title: string;
  headings: string[];
  buttons: string[];
  forms: string[];
  mainText: string;
};

export type ExtractedPageContent = RawExtract & {
  url: string;
  payload: string;
};

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export async function extractWebsiteContent(url: string): Promise<ExtractedPageContent> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    const raw = await page.evaluate((): RawExtract => {
      const title = document.title?.trim() || "Untitled";

      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((node) => node.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 30);

      const buttons = Array.from(document.querySelectorAll("button, a[role='button'], input[type='submit']"))
        .map((node) => {
          if (node instanceof HTMLInputElement) {
            return node.value?.trim() || "";
          }
          return (node.textContent || node.getAttribute("aria-label") || "").trim();
        })
        .filter(Boolean)
        .slice(0, 40);

      const forms = Array.from(document.querySelectorAll("form"))
        .map((form) => {
          const labels = Array.from(form.querySelectorAll("label"))
            .map((label) => label.textContent?.trim() || "")
            .filter(Boolean);

          const fields = Array.from(form.querySelectorAll("input, textarea, select"))
            .map((field) => {
              const element = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
              return (
                element.name?.trim() ||
                element.id?.trim() ||
                element.getAttribute("placeholder")?.trim() ||
                element.getAttribute("aria-label")?.trim() ||
                ""
              );
            })
            .filter(Boolean);

          return [...labels, ...fields].join(" | ").trim();
        })
        .filter(Boolean)
        .slice(0, 15);

      const mainNode = document.querySelector("main") || document.body;
      const mainText = (mainNode?.textContent || "").replace(/\s+/g, " ").trim();

      return {
        title,
        headings,
        buttons,
        forms,
        mainText,
      };
    });

    const normalized: RawExtract = {
      title: raw.title,
      headings: uniq(raw.headings),
      buttons: uniq(raw.buttons),
      forms: uniq(raw.forms),
      mainText: raw.mainText.slice(0, MAX_MAIN_TEXT_LENGTH),
    };

    const payload = [
      `URL: ${url}`,
      `TITLE: ${normalized.title}`,
      `HEADINGS: ${normalized.headings.join(" || ") || "None"}`,
      `BUTTONS: ${normalized.buttons.join(" || ") || "None"}`,
      `FORMS: ${normalized.forms.join(" || ") || "None"}`,
      `MAIN_TEXT: ${normalized.mainText || "None"}`,
    ].join("\n\n");

    return {
      ...normalized,
      url,
      payload,
    };
  } finally {
    await page.close();
    await browser.close();
  }
}