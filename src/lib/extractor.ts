import { chromium, devices } from "playwright";
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { logger } from "@/lib/logger";
import { analyzeSEOContent, type SEOContentAnalysis } from "@/lib/content-intelligence";
import {
  analyzeMotionSignals,
  type MotionAnalysis,
  type MotionDetectionSnapshot,
} from "@/lib/motion-intelligence";
import {
  analyzeUXIntelligence,
  type UXIntelligenceAnalysis,
  type UXIntelligenceSnapshot,
} from "@/lib/ux-intelligence";

const MAX_MAIN_TEXT_LENGTH = 4000;
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const NAV_TIMEOUT_MS = Number(process.env.EXTRACT_NAV_TIMEOUT_MS || "45000");
const POST_LOAD_WAIT_MS = Number(process.env.EXTRACT_POST_LOAD_WAIT_MS || "800");
const FALLBACK_DOM_WAIT_MS = Number(process.env.EXTRACT_FALLBACK_DOM_WAIT_MS || "12000");
const STABLE_SCREENSHOT_WAIT_MS = Number(process.env.EXTRACT_STABLE_SCREENSHOT_WAIT_MS || "3500");
const NETWORK_IDLE_TIMEOUT_MS = Number(process.env.EXTRACT_NETWORK_IDLE_TIMEOUT_MS || "10000");
const MOBILE_DEVICE_PRESET = process.env.EXTRACT_MOBILE_DEVICE_PRESET || "iPhone 14";
const MOBILE_SCROLL_STEP_PX = Number(process.env.EXTRACT_MOBILE_SCROLL_STEP_PX || "300");
const MOBILE_SCROLL_STEP_DELAY_MS = Number(process.env.EXTRACT_MOBILE_SCROLL_STEP_DELAY_MS || "100");
const MOBILE_NEUTRALIZE_STICKY = process.env.EXTRACT_MOBILE_NEUTRALIZE_STICKY === "true";

type AccessibilitySignals = {
  missingAltCount: number;
  unlabeledInputCount: number;
  headingOrderIssue: boolean;
};

type SeoSignals = {
  titleLength: number;
  hasMetaDescription: boolean;
  metaDescription: string;
  h1Text: string;
  subheadings: string[];
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
  motion: MotionDetectionSnapshot;
  uxSignals: UXIntelligenceSnapshot;
};

export type ExtractedPageContent = RawExtract & {
  url: string;
  payload: string;
  visual: VisualAssets;
  contentIntelligence: SEOContentAnalysis;
  motionAnalysis: MotionAnalysis;
  uxIntelligence: UXIntelligenceAnalysis;
};

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function bufferToDataUrl(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

async function navigateWithFallback(page: Page, url: string, context: "desktop" | "mobile"): Promise<void> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
  } catch (primaryError) {
    logger.warn("extractor.navigation.primary_failed", {
      url,
      context,
      timeoutMs: NAV_TIMEOUT_MS,
      errorMessage: toErrorMessage(primaryError),
    });

    await page.goto(url, {
      waitUntil: "commit",
      timeout: Math.min(NAV_TIMEOUT_MS, 25_000),
    });

    try {
      await page.waitForLoadState("domcontentloaded", {
        timeout: FALLBACK_DOM_WAIT_MS,
      });
    } catch (fallbackWaitError) {
      logger.warn("extractor.navigation.fallback_dom_timeout", {
        url,
        context,
        timeoutMs: FALLBACK_DOM_WAIT_MS,
        errorMessage: toErrorMessage(fallbackWaitError),
      });
    }
  }

  await page.waitForTimeout(POST_LOAD_WAIT_MS);
}

async function stabilizeForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({
    reducedMotion: "reduce",
  });

  try {
    await page.waitForLoadState("networkidle", {
      timeout: NETWORK_IDLE_TIMEOUT_MS,
    });
  } catch (error) {
    logger.warn("extractor.screenshot.networkidle_timeout", {
      timeoutMs: NETWORK_IDLE_TIMEOUT_MS,
      errorMessage: toErrorMessage(error),
    });
  }

  await page.waitForTimeout(STABLE_SCREENSHOT_WAIT_MS);

  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
      html,
      body {
        scroll-behavior: auto !important;
      }
    `,
  });

  await page.evaluate(() => {
    for (const node of Array.from(document.querySelectorAll("video"))) {
      try {
        (node as HTMLVideoElement).pause();
      } catch {
        // best effort
      }
    }
  });

  await page.waitForTimeout(120);
}

async function warmupLazyLoadedContent(page: Page): Promise<void> {
  await page.evaluate(
    async ({ step, delayMs }) => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const timer = window.setInterval(() => {
          window.scrollBy(0, step);
          totalHeight += step;

          const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          const viewportBottom = window.scrollY + window.innerHeight;
          if (viewportBottom >= scrollHeight || totalHeight >= scrollHeight + window.innerHeight) {
            window.clearInterval(timer);
            resolve();
          }
        }, delayMs);
      });

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    },
    {
      step: Math.max(100, MOBILE_SCROLL_STEP_PX),
      delayMs: Math.max(30, MOBILE_SCROLL_STEP_DELAY_MS),
    },
  );

  await page.waitForTimeout(300);
}

async function applyStickyNeutralization(page: Page): Promise<void> {
  if (!MOBILE_NEUTRALIZE_STICKY) {
    return;
  }

  await page.addStyleTag({
    content: `
      [style*="position:fixed"],
      [style*="position: fixed"],
      [style*="position:sticky"],
      [style*="position: sticky"],
      [class*="sticky" i],
      [class*="fixed" i] {
        position: absolute !important;
      }
    `,
  });
}

function getMobileContextOptions(): BrowserContextOptions {
  const preset = devices[MOBILE_DEVICE_PRESET] || devices["iPhone 14"];

  return {
    ...preset,
    viewport: preset.viewport || MOBILE_VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  };
}

async function extractRawContent(page: Page): Promise<RawExtract> {
  return page.evaluate((): RawExtract => {
    const title = document.title?.trim() || "Untitled";
    const metaDescription = document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() || "";

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean)
      .slice(0, 30);
    const h1Text = (document.querySelector("h1")?.textContent || "").trim();
    const subheadings = Array.from(document.querySelectorAll("h2, h3"))
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean)
      .slice(0, 20);

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

    let cssAnimations = 0;
    let cssTransitions = 0;
    let infiniteAnimations = 0;
    let longDurationAnimations = 0;
    let scrollRevealElements = 0;
    let flashingRisk = false;

    const sampledElements = Array.from(document.querySelectorAll("*")) as HTMLElement[];

    for (const element of sampledElements.slice(0, 2500)) {
      const className = String(element.className || "").toLowerCase();

      if (
        element.hasAttribute("data-aos") ||
        element.hasAttribute("data-scroll") ||
        element.hasAttribute("data-reveal") ||
        /reveal|scroll|animate-on-scroll|wow/.test(className)
      ) {
        scrollRevealElements += 1;
      }

      const style = window.getComputedStyle(element);
      const animationName = (style.animationName || "none").toLowerCase();
      const animationDurations = (style.animationDuration || "0s")
        .split(",")
        .map((value) => Number.parseFloat(value.trim()) || 0);
      const transitionDurations = (style.transitionDuration || "0s")
        .split(",")
        .map((value) => Number.parseFloat(value.trim()) || 0);

      const animationDurationMax = animationDurations.length ? Math.max(...animationDurations) : 0;
      const transitionDurationMax = transitionDurations.length ? Math.max(...transitionDurations) : 0;
      const hasAnimation = animationName !== "none" || animationDurationMax > 0;
      const hasTransition = transitionDurationMax > 0;

      if (hasAnimation) {
        cssAnimations += 1;
      }
      if (hasTransition) {
        cssTransitions += 1;
      }

      if ((style.animationIterationCount || "").toLowerCase().includes("infinite")) {
        infiniteAnimations += 1;
      }

      if (animationDurationMax > 0.7 || transitionDurationMax > 0.7) {
        longDurationAnimations += 1;
      }

      if (animationDurationMax > 0 && animationDurationMax <= 0.2 && (style.animationIterationCount || "").toLowerCase().includes("infinite")) {
        flashingRisk = true;
      }
    }

    const scriptTags = Array.from(document.querySelectorAll("script"));
    const inlineScriptText = scriptTags
      .map((script) => script.textContent || "")
      .join("\n")
      .toLowerCase();

    const requestAnimationFrameHits = (inlineScriptText.match(/requestanimationframe/g) || []).length;
    const setIntervalHits = (inlineScriptText.match(/setinterval/g) || []).length;
    const externalAnimationLibraries = scriptTags.filter((script) => {
      const src = (script.getAttribute("src") || "").toLowerCase();
      return /lottie|gsap|scrollreveal|swiper|slick|anime(\.js)?/.test(src);
    }).length;

    const jsAnimationHooks = requestAnimationFrameHits + setIntervalHits + externalAnimationLibraries;

    const lottieInstances =
      document.querySelectorAll("lottie-player, [data-lottie], [data-animation-json], [data-anim-lottie]").length +
      scriptTags.filter((script) => /lottie/.test((script.getAttribute("src") || "").toLowerCase())).length;

    const carouselCandidates = Array.from(
      document.querySelectorAll(
        "[data-ride='carousel'], [data-carousel], [aria-roledescription='carousel'], .swiper, .slick-slider, .carousel",
      ),
    ) as HTMLElement[];

    const autoCarousels = carouselCandidates.filter((element) => {
      const className = String(element.className || "").toLowerCase();
      const autoplayAttr = (element.getAttribute("data-autoplay") || element.getAttribute("autoplay") || "").toLowerCase();
      const intervalAttr = element.getAttribute("data-interval") || "";
      return /autoplay|auto-rotate|autoscroll/.test(className) || autoplayAttr === "true" || intervalAttr !== "";
    }).length;

    const videoLikeAnimations = document.querySelectorAll("video, canvas").length;

    const pauseControlPresent = Array.from(document.querySelectorAll("button, [role='button'], [aria-label]"))
      .map((element) => `${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`.toLowerCase())
      .some((text) => /pause|stop|play/.test(text));

    const styleNodesText = Array.from(document.querySelectorAll("style"))
      .map((node) => node.textContent || "")
      .join("\n")
      .toLowerCase();

    let reducedMotionSupport = /prefers-reduced-motion/.test(styleNodesText) || /prefers-reduced-motion/.test(inlineScriptText);

    if (!reducedMotionSupport) {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from((sheet as CSSStyleSheet).cssRules || []);
          if (
            rules.some(
              (rule) =>
                rule instanceof CSSMediaRule &&
                (rule.media.mediaText || "").toLowerCase().includes("prefers-reduced-motion"),
            )
          ) {
            reducedMotionSupport = true;
            break;
          }
        } catch {
          // cross-origin stylesheet is not readable
        }
      }
    }

    const heroCandidate =
      (document.querySelector("[class*='hero' i]") as HTMLElement | null) ||
      (document.querySelector("header") as HTMLElement | null) ||
      (document.querySelector("main h1")?.closest("section") as HTMLElement | null) ||
      (document.querySelector("main h1")?.parentElement as HTMLElement | null);

    let lcpElementLikelyAnimated = false;
    if (heroCandidate) {
      const heroStyle = window.getComputedStyle(heroCandidate);
      const heroAnimationDuration = Number.parseFloat((heroStyle.animationDuration || "0").split(",")[0] || "0") || 0;
      const heroTransitionDuration = Number.parseFloat((heroStyle.transitionDuration || "0").split(",")[0] || "0") || 0;
      lcpElementLikelyAnimated =
        (heroStyle.animationName || "none").toLowerCase() !== "none" || heroAnimationDuration > 0 || heroTransitionDuration > 0;
    }

    const potentialRisks: string[] = [];
    if (autoCarousels > 0) {
      potentialRisks.push("auto-rotating hero slider");
    }
    if (infiniteAnimations > 0) {
      potentialRisks.push("infinite background animation");
    }
    if (longDurationAnimations > 0) {
      potentialRisks.push("animation duration exceeds 700ms on key elements");
    }
    if (scrollRevealElements > 6) {
      potentialRisks.push("heavy scroll reveal usage may create perceived lag");
    }
    if (!reducedMotionSupport) {
      potentialRisks.push("missing prefers-reduced-motion support");
    }
    if (autoCarousels > 0 && !pauseControlPresent) {
      potentialRisks.push("moving content lacks pause/stop control");
    }
    if (flashingRisk) {
      potentialRisks.push("high-frequency flashing animation risk detected");
    }

    const viewportHeight = window.innerHeight || 768;

    const interactiveCandidates = Array.from(
      document.querySelectorAll("a[href], button, [role='button'], input[type='submit'], input[type='button']"),
    ) as HTMLElement[];

    const ctaLabels = /start|get|try|book|buy|demo|sign up|signup|contact|free|join|talk|schedule|launch|download|continue|submit|click here/i;
    const primaryLabelHints = /start|get|book|buy|demo|free trial|try|sign up|join|schedule|talk/i;
    const benefitLabelHints = /free|trial|save|increase|boost|faster|better|grow|convert|results?|outcomes?/i;
    const urgencyLabelHints = /now|today|limited|instant|quick|immediately|urgent|last chance/i;
    const vagueLabelHints = /submit|click here|learn more|read more|continue/i;

    const aboveFoldCtas = interactiveCandidates.filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 16) {
        return false;
      }
      const label = (element.textContent || element.getAttribute("aria-label") || "").trim();
      return Boolean(label) && ctaLabels.test(label) && rect.top < viewportHeight;
    });

    const primaryAboveFoldCtas = aboveFoldCtas.filter((element) => {
      const label = (element.textContent || element.getAttribute("aria-label") || "").trim();
      return primaryLabelHints.test(label);
    });

    const ctaColors = new Set<string>();
    for (const cta of aboveFoldCtas) {
      const style = window.getComputedStyle(cta);
      ctaColors.add(`${style.backgroundColor}|${style.color}`);
    }

    const heroElement =
      (document.querySelector("[class*='hero' i]") as HTMLElement | null) ||
      (document.querySelector("header") as HTMLElement | null) ||
      (document.querySelector("main section") as HTMLElement | null) ||
      (document.querySelector("main") as HTMLElement | null);

    const heroElementCount = heroElement ? heroElement.querySelectorAll("*").length : 0;
    const heroInteractiveCount = heroElement
      ? heroElement.querySelectorAll("a[href], button, [role='button'], input, select, textarea").length
      : 0;

    const h1Node = document.querySelector("h1") as HTMLElement | null;
    const h1Rect = h1Node?.getBoundingClientRect();
    const h1Area = h1Rect ? Math.max(1, h1Rect.width * h1Rect.height) : 1;
    const heroRect = heroElement?.getBoundingClientRect();
    const heroArea = heroRect ? Math.max(1, heroRect.width * Math.min(heroRect.height, viewportHeight)) : Math.max(1, viewportHeight * 360);
    const h1DominanceRatio = Math.min(1.5, h1Area / heroArea);

    const primaryCtaAreas = primaryAboveFoldCtas.map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width * rect.height;
    });

    const secondaryCtaAreas = aboveFoldCtas
      .filter((element) => !primaryAboveFoldCtas.includes(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width * rect.height;
      });

    const avgPrimaryArea =
      primaryCtaAreas.length > 0
        ? primaryCtaAreas.reduce((sum, value) => sum + value, 0) / primaryCtaAreas.length
        : 0;
    const avgSecondaryArea =
      secondaryCtaAreas.length > 0
        ? secondaryCtaAreas.reduce((sum, value) => sum + value, 0) / secondaryCtaAreas.length
        : 1;
    const ctaVisualDominanceRatio = Math.min(3, avgPrimaryArea / Math.max(1, avgSecondaryArea));

    const keyFlowElements = [
      document.querySelector("h1") as HTMLElement | null,
      ...Array.from(document.querySelectorAll("h2")).slice(0, 2) as HTMLElement[],
      ...(aboveFoldCtas.slice(0, 2) as HTMLElement[]),
    ].filter((node): node is HTMLElement => Boolean(node));

    let flowReadingIssueCount = 0;
    let previousTop = -1;
    for (const element of keyFlowElements) {
      const rect = element.getBoundingClientRect();
      if (previousTop > rect.top + 24) {
        flowReadingIssueCount += 1;
      }
      previousTop = rect.top;
    }

    const leftAlignedKeyElementsRatio =
      keyFlowElements.length > 0
        ? keyFlowElements.filter((element) => element.getBoundingClientRect().left <= 40).length / keyFlowElements.length
        : 0.5;

    const ctaTexts = aboveFoldCtas.map((element) => (element.textContent || element.getAttribute("aria-label") || "").trim());
    const vagueCtaCount = ctaTexts.filter((text) => vagueLabelHints.test(text)).length;
    const benefitCtaCount = ctaTexts.filter((text) => benefitLabelHints.test(text)).length;
    const urgencyCtaCount = ctaTexts.filter((text) => urgencyLabelHints.test(text)).length;

    const formElements = Array.from(document.querySelectorAll("form"));
    let maxFormFieldCount = 0;
    let requiresPhoneAndEmail = false;
    for (const form of formElements) {
      const fields = Array.from(form.querySelectorAll("input, select, textarea"));
      maxFormFieldCount = Math.max(maxFormFieldCount, fields.length);

      const fieldTokens = fields
        .map((field) => {
          const input = field as HTMLInputElement;
          return `${input.type || ""} ${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`.toLowerCase();
        })
        .join(" ");

      if (/email/.test(fieldTokens) && /phone|mobile|tel/.test(fieldTokens)) {
        requiresPhoneAndEmail = true;
      }
    }

    const progressIndicatorPresent =
      document.querySelectorAll("progress, [aria-valuenow], [class*='progress' i], [class*='step' i]").length > 0;

    const pageText = document.body.textContent?.toLowerCase() || "";
    const testimonialsPresent = /testimonial|what customers say|case study|reviews?/.test(pageText);
    const socialProofPresent = /trusted by|customers|companies|users|downloads|clients/.test(pageText);
    const trustBadgePresent = /ssl|secure|money-back|trusted|gdpr|iso|verified|pci/.test(pageText);
    const aboutOrContactVisible =
      Array.from(document.querySelectorAll("a, nav a"))
        .map((node) => (node.textContent || "").toLowerCase())
        .some((text) => /about|contact|support|help/.test(text));

    let hoverFeedbackSignals = 0;
    for (const element of interactiveCandidates.slice(0, 80)) {
      const style = window.getComputedStyle(element);
      const transitionDuration = Number.parseFloat((style.transitionDuration || "0").split(",")[0] || "0") || 0;
      if (transitionDuration > 0 || style.cursor === "pointer") {
        hoverFeedbackSignals += 1;
      }
    }

    const styleSheetText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent || "")
      .join("\n")
      .toLowerCase();
    const inputFocusSignals = /:focus|:focus-visible/.test(styleSheetText) ? 1 : 0;

    const primaryCtaMinY =
      primaryAboveFoldCtas.length > 0
        ? Math.min(...primaryAboveFoldCtas.map((node) => node.getBoundingClientRect().top))
        : aboveFoldCtas.length > 0
          ? Math.min(...aboveFoldCtas.map((node) => node.getBoundingClientRect().top))
          : viewportHeight + 200;

    const navRoot = (document.querySelector("nav") as HTMLElement | null) || (document.querySelector("header") as HTMLElement | null);
    const menuItemsCount = navRoot ? navRoot.querySelectorAll("a, button").length : 0;
    let navMaxDepth = 1;
    if (navRoot) {
      const navItems = Array.from(navRoot.querySelectorAll("a, button, li"));
      for (const item of navItems) {
        let depth = 1;
        let current: Element | null = item;
        while (current && current !== navRoot) {
          if (current.tagName === "UL" || current.tagName === "OL") {
            depth += 1;
          }
          current = current.parentElement;
        }
        navMaxDepth = Math.max(navMaxDepth, depth);
      }
    }

    const hasHamburger = Boolean(
      document.querySelector("[aria-label*='menu' i], [class*='hamburger' i], [class*='menu-toggle' i], [data-menu-toggle]"),
    );
    const hasVisibleDesktopLikeNav = menuItemsCount >= 5;

    const headlineLength = (h1Node?.textContent || title || "").trim().length;
    const hasValuePropHint = /save|faster|grow|increase|reduce|automate|improve|book|convert|scale/.test(
      `${h1Node?.textContent || ""} ${metaDescription}`.toLowerCase(),
    );

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
        metaDescription,
        h1Text,
        subheadings,
        h1Count: document.querySelectorAll("h1").length,
        ctaCount,
      },
      motion: {
        cssAnimations,
        cssTransitions,
        jsAnimationHooks,
        scrollRevealElements,
        autoCarousels,
        lottieInstances,
        videoLikeAnimations,
        infiniteAnimations,
        longDurationAnimations,
        reducedMotionSupport,
        pauseControlPresent,
        flashingRisk,
        lcpElementLikelyAnimated,
        potentialRisks,
      },
      uxSignals: {
        ctaCountAboveFold: aboveFoldCtas.length,
        primaryCtaCountAboveFold: primaryAboveFoldCtas.length,
        ctaColorVariantCountAboveFold: ctaColors.size,
        heroElementCount,
        heroInteractiveCount,
        h1DominanceRatio,
        ctaVisualDominanceRatio,
        flowReadingIssueCount,
        leftAlignedKeyElementsRatio,
        vagueCtaCount,
        benefitCtaCount,
        urgencyCtaCount,
        maxFormFieldCount,
        requiresPhoneAndEmail,
        progressIndicatorPresent,
        trustBadgePresent,
        testimonialsPresent,
        socialProofPresent,
        aboutOrContactVisible,
        hoverFeedbackSignals,
        inputFocusSignals,
        primaryCtaMinY,
        viewportHeight,
        menuItemsCount,
        navMaxDepth,
        hasHamburger,
        hasVisibleDesktopLikeNav,
        headlineLength,
        hasValuePropHint,
      },
    };
  });
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
    await navigateWithFallback(page, url, "desktop");

    const raw = await extractRawContent(page);
    const motionAnalysis = analyzeMotionSignals(raw.motion);

    await stabilizeForScreenshot(page);

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

    const mobileContext = await browser.newContext(getMobileContextOptions());
    const mobilePage = await mobileContext.newPage();
    let mobileImage = aboveFoldImage;

    try {
      await navigateWithFallback(mobilePage, url, "mobile");
      await warmupLazyLoadedContent(mobilePage);
      await stabilizeForScreenshot(mobilePage);
      await applyStickyNeutralization(mobilePage);

      mobileImage = await mobilePage.screenshot({
        type: "jpeg",
        quality: 55,
        clip: {
          x: 0,
          y: 0,
          width: mobilePage.viewportSize()?.width || MOBILE_VIEWPORT.width,
          height: mobilePage.viewportSize()?.height || MOBILE_VIEWPORT.height,
        },
      });
    } catch (mobileError) {
      logger.warn("extractor.mobile.capture_failed", {
        url,
        errorMessage: toErrorMessage(mobileError),
      });
    } finally {
      await mobilePage.close();
      await mobileContext.close();
    }

    const normalized: RawExtract = {
      title: raw.title,
      headings: uniq(raw.headings),
      buttons: uniq(raw.buttons),
      forms: uniq(raw.forms),
      mainText: raw.mainText.slice(0, MAX_MAIN_TEXT_LENGTH),
      accessibility: raw.accessibility,
      seo: raw.seo,
      motion: raw.motion,
      uxSignals: raw.uxSignals,
    };

    const visual: VisualAssets = {
      fullPage: bufferToDataUrl(fullPageImage),
      aboveTheFold: bufferToDataUrl(aboveFoldImage),
      mobile: bufferToDataUrl(mobileImage),
    };

    const contentIntelligence = analyzeSEOContent({
      title: normalized.title,
      headings: normalized.headings,
      mainText: normalized.mainText,
      metaDescription: normalized.seo.metaDescription,
      h1Text: normalized.seo.h1Text,
      subheadings: normalized.seo.subheadings,
    });

    const uxIntelligence = analyzeUXIntelligence(normalized.uxSignals, {
      motionAnalysis,
      readabilityScore: contentIntelligence.readability_score,
    });

    const payload = [
      `URL: ${url}`,
      `TITLE: ${normalized.title}`,
      `HEADINGS: ${normalized.headings.join(" || ") || "None"}`,
      `BUTTONS: ${normalized.buttons.join(" || ") || "None"}`,
      `FORMS: ${normalized.forms.join(" || ") || "None"}`,
      `MAIN_TEXT: ${normalized.mainText || "None"}`,
      `A11Y_BASELINE: ${JSON.stringify(normalized.accessibility)}`,
      `SEO_BASELINE: ${JSON.stringify(normalized.seo)}`,
      `MOTION_BASELINE: ${JSON.stringify(motionAnalysis)}`,
      `CONTENT_INTELLIGENCE: ${JSON.stringify(contentIntelligence)}`,
      `UX_INTELLIGENCE: ${JSON.stringify(uxIntelligence)}`,
    ].join("\n\n");

    return {
      ...normalized,
      url,
      payload,
      visual,
      contentIntelligence,
      motionAnalysis,
      uxIntelligence,
    };
  } finally {
    await page.close();
    await desktopContext.close();
    await browser.close();
  }
}