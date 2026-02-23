import { chromium } from "playwright";
import type { Browser } from "playwright";

const MAX_MAIN_TEXT_LENGTH = 4000;
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

type AccessibilitySignals = {
  missingAltCount: number;
  unlabeledInputCount: number;
  headingOrderIssue: boolean;
};

type SeoSignals = {
  titleLength: number;
  hasMetaDescription: boolean;
  h1Count: number;
  ctaCount: number;
};

type VisualAssets = {
  fullPage: string;
  aboveTheFold: string;
  mobile: string;
};

type RawExtract = {
  title: string;
  headings: string[];
  buttons: string[];
  forms: string[];
  mainText: string;
  accessibility: AccessibilitySignals;
  seo: SeoSignals;
};

export type ExtractedPageContent = RawExtract & {
  url: string;
  payload: string;
  visual: VisualAssets;
};

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function bufferToDataUrl(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const [{ chromium: playwrightChromium }, { default: chromiumBinary }] = await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
    ]);

    const executablePath = await chromiumBinary.executablePath();

    return playwrightChromium.launch({
      args: chromiumBinary.args,
      executablePath,
      headless: true,
    });
  }

  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function extractWebsiteContent(url: string): Promise<ExtractedPageContent> {
  const browser = await launchBrowser();
  const desktopContext = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  const page = await desktopContext.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    const fullPageImage = await page.screenshot({
      type: "jpeg",
      quality: 45,
      fullPage: true,
    });

    const aboveFoldImage = await page.screenshot({
      type: "jpeg",
      quality: 55,
      clip: {
        x: 0,
        y: 0,
        width: DEFAULT_VIEWPORT.width,
        height: DEFAULT_VIEWPORT.height,
      },
    });

    const mobileContext = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await mobilePage.waitForTimeout(500);

    const mobileImage = await mobilePage.screenshot({
      type: "jpeg",
      quality: 55,
      clip: {
        x: 0,
        y: 0,
        width: MOBILE_VIEWPORT.width,
        height: MOBILE_VIEWPORT.height,
      },
    });

    await mobilePage.close();
    await mobileContext.close();

    const raw = await page.evaluate((): RawExtract => {
      const title = document.title?.trim() || "Untitled";
      const metaDescription = document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() || "";

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

      const ctaCount = Array.from(document.querySelectorAll("a, button"))
        .map((node) => (node.textContent || "").trim().toLowerCase())
        .filter((label) => /start|get|try|book|buy|sign up|signup|contact|learn|demo/.test(label)).length;

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

      const hTags = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      let previousLevel = 0;
      let headingOrderIssue = false;
      for (const heading of hTags) {
        const level = Number(heading.tagName.replace("H", ""));
        if (previousLevel && level - previousLevel > 1) {
          headingOrderIssue = true;
          break;
        }
        previousLevel = level;
      }

      const images = Array.from(document.querySelectorAll("img"));
      const missingAltCount = images.filter((image) => !(image.getAttribute("alt") || "").trim()).length;

      const formFields = Array.from(document.querySelectorAll("input, textarea, select"));
      const unlabeledInputCount = formFields.filter((field) => {
        const element = field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (element.getAttribute("aria-label")?.trim()) {
          return false;
        }
        if (element.id) {
          const label = document.querySelector(`label[for='${element.id}']`);
          if (label) {
            return false;
          }
        }
        const parentLabel = element.closest("label");
        return !parentLabel;
      }).length;

      return {
        title,
        headings,
        buttons,
        forms,
        mainText,
        accessibility: {
          missingAltCount,
          unlabeledInputCount,
          headingOrderIssue,
        },
        seo: {
          titleLength: title.length,
          hasMetaDescription: Boolean(metaDescription),
          h1Count: document.querySelectorAll("h1").length,
          ctaCount,
        },
      };
    });

    const normalized: RawExtract = {
      title: raw.title,
      headings: uniq(raw.headings),
      buttons: uniq(raw.buttons),
      forms: uniq(raw.forms),
      mainText: raw.mainText.slice(0, MAX_MAIN_TEXT_LENGTH),
      accessibility: raw.accessibility,
      seo: raw.seo,
    };

    const visual: VisualAssets = {
      fullPage: bufferToDataUrl(fullPageImage),
      aboveTheFold: bufferToDataUrl(aboveFoldImage),
      mobile: bufferToDataUrl(mobileImage),
    };

    const payload = [
      `URL: ${url}`,
      `TITLE: ${normalized.title}`,
      `HEADINGS: ${normalized.headings.join(" || ") || "None"}`,
      `BUTTONS: ${normalized.buttons.join(" || ") || "None"}`,
      `FORMS: ${normalized.forms.join(" || ") || "None"}`,
      `MAIN_TEXT: ${normalized.mainText || "None"}`,
      `A11Y_BASELINE: ${JSON.stringify(normalized.accessibility)}`,
      `SEO_BASELINE: ${JSON.stringify(normalized.seo)}`,
    ].join("\n\n");

    return {
      ...normalized,
      url,
      payload,
      visual,
    };
  } finally {
    await page.close();
    await desktopContext.close();
    await browser.close();
  }
}