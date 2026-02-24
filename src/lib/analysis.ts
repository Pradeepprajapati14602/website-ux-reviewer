import OpenAI from "openai";
import type { ExtractedPageContent } from "@/lib/extractor";
import { logger } from "@/lib/logger";
import { UX_AUDIT_PROMPT } from "@/lib/prompt";

export type UXCategory = "clarity" | "layout" | "navigation" | "accessibility" | "trust";
export type UXSeverity = "low" | "medium" | "high";
export type ConfidenceLevel = "high" | "medium" | "low";
export type EvidenceSource = "deterministic" | "heuristic" | "ai_inferred";
export type PriorityLabel = "critical" | "high" | "medium" | "low" | "quick_win";

export type UXIssue = {
  category: UXCategory;
  title: string;
  why: string;
  evidence: string;
  severity: UXSeverity;
  confidence?: ConfidenceLevel;
  evidenceWeight?: number;
  sourceType?: EvidenceSource;
  impactScore?: number;
  effortScore?: number;
  priorityScore?: number;
  priorityLabel?: PriorityLabel;
  fixSnippet?: string;
};

export type UXImprovement = {
  before: string;
  after: string;
};

export type AuditFinding = {
  title: string;
  why: string;
  evidence: string;
  severity: UXSeverity;
  confidence?: ConfidenceLevel;
  evidenceWeight?: number;
  sourceType?: EvidenceSource;
  impactScore?: number;
  effortScore?: number;
  priorityScore?: number;
  priorityLabel?: PriorityLabel;
  fixSnippet?: string;
};

export type AuditSection = {
  score: number;
  findings: AuditFinding[];
};

export type UXReview = {
  score: number;
  issues: UXIssue[];
  top_improvements: UXImprovement[];
  ux: {
    score: number;
    issues: UXIssue[];
    top_improvements: UXImprovement[];
  };
  accessibility: AuditSection;
  seo: AuditSection;
  visual: AuditSection;
};

const allowedCategories: UXCategory[] = ["clarity", "layout", "navigation", "accessibility", "trust"];
const allowedSeverity: UXSeverity[] = ["low", "medium", "high"];
const allowedConfidence: ConfidenceLevel[] = ["high", "medium", "low"];
const allowedSourceTypes: EvidenceSource[] = ["deterministic", "heuristic", "ai_inferred"];
const allowedPriorityLabels: PriorityLabel[] = ["critical", "high", "medium", "low", "quick_win"];
const LLM_PROVIDER =
  process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "xai");
const LLM_BASE_URL =
  process.env.LLM_BASE_URL ||
  (LLM_PROVIDER === "groq" ? process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1" : process.env.GROK_BASE_URL || "https://api.x.ai/v1");
const AUDIT_MODEL =
  process.env.LLM_AUDIT_MODEL ||
  (LLM_PROVIDER === "groq" ? process.env.GROQ_AUDIT_MODEL || "llama-3.1-8b-instant" : process.env.GROK_AUDIT_MODEL || "grok-2-latest");
const HEALTH_MODEL =
  process.env.LLM_HEALTH_MODEL ||
  (LLM_PROVIDER === "groq" ? process.env.GROQ_HEALTH_MODEL || AUDIT_MODEL : process.env.GROK_HEALTH_MODEL || AUDIT_MODEL);
const MAX_AUDIT_INPUT_CHARS = 5000;
const MAX_AUDIT_COMPLETION_TOKENS = 900;
const MAX_VISUAL_IMAGE_URL_LENGTH = 2_000_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toClampedScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampScore(parsed);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimAuditInput(content: string): { value: string; truncated: boolean } {
  if (content.length <= MAX_AUDIT_INPUT_CHARS) {
    return { value: content, truncated: false };
  }

  return {
    value: content.slice(0, MAX_AUDIT_INPUT_CHARS),
    truncated: true,
  };
}

function extractSection(content: string, key: string): string {
  const match = content.match(new RegExp(`${key}:\\s*(.*)`, "i"));
  return match?.[1]?.trim() || "";
}

function splitPipeList(value: string): string[] {
  if (!value || value === "None") {
    return [];
  }

  return value
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractEvidence(content: string, key: string): string {
  const value = extractSection(content, key);
  if (!value || value === "None") {
    return "No clear evidence found in extracted text.";
  }

  return value.slice(0, 140);
}

function calculateFallbackScore(content: string): number {
  const title = extractSection(content, "TITLE");
  const headings = splitPipeList(extractSection(content, "HEADINGS"));
  const buttons = splitPipeList(extractSection(content, "BUTTONS"));
  const forms = splitPipeList(extractSection(content, "FORMS"));
  const mainText = extractSection(content, "MAIN_TEXT");

  let score = 50;

  score += title && title !== "None" ? 8 : -10;

  if (headings.length === 0) {
    score -= 12;
  } else if (headings.length <= 2) {
    score += 2;
  } else if (headings.length <= 8) {
    score += 8;
  } else {
    score += 4;
  }

  if (buttons.length === 0) {
    score -= 8;
  } else if (buttons.length <= 2) {
    score += 2;
  } else if (buttons.length <= 8) {
    score += 6;
  } else {
    score += 3;
  }

  if (forms.length >= 1 && forms.length <= 3) {
    score += 6;
  } else if (forms.length > 3) {
    score += 3;
  }

  if (mainText.length < 200) {
    score -= 10;
  } else if (mainText.length <= 1200) {
    score += 8;
  } else {
    score += 4;
  }

  const hasTrustCue = /(testimonial|reviews?|secure|privacy|trusted|guarantee|contact|about)/i.test(mainText);
  score += hasTrustCue ? 6 : -4;

  return clampScore(score);
}

function extractJsonCandidate(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

function parsePossiblyWrappedJson(text: string): unknown {
  const candidate = extractJsonCandidate(text);

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response did not contain JSON.");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function normalizeIssue(input: unknown): UXIssue | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const item = input as Record<string, unknown>;
  const category = String(item.category || "clarity").toLowerCase() as UXCategory;
  const severity = String(item.severity || "medium").toLowerCase() as UXSeverity;
  const confidence = String(item.confidence || "medium").toLowerCase() as ConfidenceLevel;
  const sourceType = String(item.sourceType || "ai_inferred").toLowerCase() as EvidenceSource;
  const priorityLabel = String(item.priorityLabel || "medium").toLowerCase() as PriorityLabel;

  return {
    category: allowedCategories.includes(category) ? category : "clarity",
    title: String(item.title || "Untitled issue").trim(),
    why: String(item.why || "No explanation provided.").trim(),
    evidence: String(item.evidence || "").trim(),
    severity: allowedSeverity.includes(severity) ? severity : "medium",
    confidence: allowedConfidence.includes(confidence) ? confidence : "medium",
    evidenceWeight: toClampedScore(item.evidenceWeight, 50),
    sourceType: allowedSourceTypes.includes(sourceType) ? sourceType : "ai_inferred",
    impactScore: toClampedScore(item.impactScore, 60),
    effortScore: toClampedScore(item.effortScore, 45),
    priorityScore: toClampedScore(item.priorityScore, 50),
    priorityLabel: allowedPriorityLabels.includes(priorityLabel) ? priorityLabel : "medium",
    fixSnippet: String(item.fixSnippet || "").trim() || undefined,
  };
}

function normalizeFinding(input: unknown): AuditFinding | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const item = input as Record<string, unknown>;
  const severity = String(item.severity || "medium").toLowerCase() as UXSeverity;
  const confidence = String(item.confidence || "medium").toLowerCase() as ConfidenceLevel;
  const sourceType = String(item.sourceType || "ai_inferred").toLowerCase() as EvidenceSource;
  const priorityLabel = String(item.priorityLabel || "medium").toLowerCase() as PriorityLabel;

  return {
    title: String(item.title || "Untitled finding").trim(),
    why: String(item.why || "No explanation provided.").trim(),
    evidence: String(item.evidence || "").trim(),
    severity: allowedSeverity.includes(severity) ? severity : "medium",
    confidence: allowedConfidence.includes(confidence) ? confidence : "medium",
    evidenceWeight: toClampedScore(item.evidenceWeight, 50),
    sourceType: allowedSourceTypes.includes(sourceType) ? sourceType : "ai_inferred",
    impactScore: toClampedScore(item.impactScore, 60),
    effortScore: toClampedScore(item.effortScore, 45),
    priorityScore: toClampedScore(item.priorityScore, 50),
    priorityLabel: allowedPriorityLabels.includes(priorityLabel) ? priorityLabel : "medium",
    fixSnippet: String(item.fixSnippet || "").trim() || undefined,
  };
}

function normalizeFindings(value: unknown, fallback: AuditFinding[] = []): AuditFinding[] {
  const list = Array.isArray(value) ? value : [];
  const findings = list.map(normalizeFinding).filter((item): item is AuditFinding => Boolean(item)).slice(0, 10);

  if (findings.length > 0) {
    return findings;
  }

  return fallback;
}

function sanitizeReview(input: unknown): UXReview {
  const source = (input ?? {}) as Record<string, unknown>;
  const score = clampScore(Number(source.score ?? source.website_health_score ?? source.health_score ?? 0));

  const rawIssues = Array.isArray(source.issues) ? source.issues : [];
  const issues = rawIssues.map(normalizeIssue).filter((item): item is UXIssue => Boolean(item)).slice(0, 12);

  const rawImprovements = Array.isArray(source.top_improvements) ? source.top_improvements : [];
  const top_improvements: UXImprovement[] = rawImprovements
    .map((value): UXImprovement | null => {
      if (!value || typeof value !== "object") {
        return null;
      }
      const item = value as Record<string, unknown>;
      return {
        before: String(item.before || "").trim(),
        after: String(item.after || "").trim(),
      };
    })
    .filter((item): item is UXImprovement => Boolean(item))
    .slice(0, 3);

  const fallbackFindings = issues.slice(0, 6).map((issue) => ({
    title: issue.title,
    why: issue.why,
    evidence: issue.evidence,
    severity: issue.severity,
  }));

  const uxSection = (source.ux || {}) as Record<string, unknown>;
  const uxIssues = (Array.isArray(uxSection.issues) ? uxSection.issues : issues)
    .map(normalizeIssue)
    .filter((item): item is UXIssue => Boolean(item))
    .slice(0, 12);

  const uxTopImprovements = (Array.isArray(uxSection.top_improvements) ? uxSection.top_improvements : top_improvements)
    .map((value): UXImprovement | null => {
      if (!value || typeof value !== "object") {
        return null;
      }
      const item = value as Record<string, unknown>;
      return {
        before: String(item.before || "").trim(),
        after: String(item.after || "").trim(),
      };
    })
    .filter((item): item is UXImprovement => Boolean(item))
    .slice(0, 3);

  const accessibilitySection = (source.accessibility || source.a11y || {}) as Record<string, unknown>;
  const seoSection = (source.seo || {}) as Record<string, unknown>;
  const visualSection = (source.visual || source.visual_findings || {}) as Record<string, unknown>;

  return {
    score,
    issues: uxIssues.length > 0 ? uxIssues : issues,
    top_improvements: uxTopImprovements.length > 0 ? uxTopImprovements : top_improvements,
    ux: {
      score: clampScore(Number(uxSection.score ?? score)),
      issues: uxIssues.length > 0 ? uxIssues : issues,
      top_improvements: uxTopImprovements.length > 0 ? uxTopImprovements : top_improvements,
    },
    accessibility: {
      score: clampScore(Number(accessibilitySection.score ?? score - 8)),
      findings: normalizeFindings(accessibilitySection.findings, fallbackFindings),
    },
    seo: {
      score: clampScore(Number(seoSection.score ?? score - 6)),
      findings: normalizeFindings(seoSection.findings, fallbackFindings),
    },
    visual: {
      score: clampScore(Number(visualSection.score ?? score - 5)),
      findings: normalizeFindings(visualSection.findings, fallbackFindings),
    },
  };
}

function createFallbackReview(content: string): UXReview {
  const title = extractEvidence(content, "TITLE");
  const headings = extractEvidence(content, "HEADINGS");
  const buttons = extractEvidence(content, "BUTTONS");
  const forms = extractEvidence(content, "FORMS");
  const mainText = extractEvidence(content, "MAIN_TEXT");

  const score = calculateFallbackScore(content);

  const issues: UXIssue[] = [
    {
      category: "clarity",
      title: "Value proposition could be clearer above the fold",
      why: "Users may not immediately understand what the product does.",
      evidence: title,
      severity: "high",
    },
    {
      category: "layout",
      title: "Content hierarchy is hard to scan",
      why: "Heading structure may not guide users through key information.",
      evidence: headings,
      severity: "medium",
    },
    {
      category: "navigation",
      title: "Primary action emphasis is unclear",
      why: "Multiple similar actions can increase decision friction.",
      evidence: buttons,
      severity: "medium",
    },
    {
      category: "accessibility",
      title: "Form fields may lack clear context",
      why: "Ambiguous labels can reduce completion and accessibility.",
      evidence: forms,
      severity: "high",
    },
    {
      category: "trust",
      title: "Trust indicators are not prominent",
      why: "Users look for signals like proof, policy clarity, and contact confidence.",
      evidence: mainText,
      severity: "medium",
    },
    {
      category: "clarity",
      title: "Copy appears dense in key sections",
      why: "Long paragraphs can reduce comprehension and increase bounce.",
      evidence: mainText,
      severity: "low",
    },
  ];

  const top_improvements: UXImprovement[] = [
    {
      before: "Generic headline and dense intro text",
      after: "Use a single-sentence value proposition with one supporting line.",
    },
    {
      before: "Multiple competing actions",
      after: "Prioritize one primary CTA and de-emphasize secondary actions.",
    },
    {
      before: "Forms with unclear context",
      after: "Add explicit labels, helper text, and clearer field intent.",
    },
  ];

  const findings = issues.map((issue) => ({
    title: issue.title,
    why: issue.why,
    evidence: issue.evidence,
    severity: issue.severity,
  }));

  return {
    score,
    issues,
    top_improvements,
    ux: {
      score,
      issues,
      top_improvements,
    },
    accessibility: {
      score: clampScore(score - 8),
      findings,
    },
    seo: {
      score: clampScore(score - 6),
      findings,
    },
    visual: {
      score: clampScore(score - 5),
      findings,
    },
  };
}

function isRetryableOpenAIError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return RETRYABLE_STATUS_CODES.has(error.status || 0);
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("network");
}

function buildAuditMessages(input: ExtractedPageContent, auditInput: string): Array<{ role: "system" | "user"; content: unknown }> {
  const supportsVision = LLM_PROVIDER !== "groq";

  const contentParts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        "Analyze the website using DOM summary, baseline accessibility/SEO signals, and screenshots.",
        "DOM_SUMMARY:",
        auditInput,
      ].join("\n\n"),
    },
  ];

  const visuals = [
    { label: "Above-the-fold screenshot", url: input.visual.aboveTheFold },
    { label: "Mobile screenshot", url: input.visual.mobile },
    { label: "Full-page screenshot", url: input.visual.fullPage },
  ];

  for (const visual of visuals) {
    if (!supportsVision || visual.url.length > MAX_VISUAL_IMAGE_URL_LENGTH) {
      continue;
    }

    contentParts.push({ type: "text", text: visual.label });
    contentParts.push({
      type: "image_url",
      image_url: {
        url: visual.url,
      },
    });
  }

  return [
    { role: "system", content: UX_AUDIT_PROMPT },
    { role: "user", content: contentParts },
  ];
}

export async function runUxAudit(input: ExtractedPageContent): Promise<UXReview> {
  const apiKey =
    process.env.LLM_API_KEY ||
    (LLM_PROVIDER === "groq" ? process.env.GROQ_API_KEY : process.env.GROK_API_KEY);
  if (!apiKey) {
    throw new Error("LLM API key is missing.");
  }

  const requestStart = Date.now();
  const { value: auditInput, truncated } = trimAuditInput(input.payload);

  if (truncated) {
    logger.warn("llm.audit.input_truncated", {
      model: AUDIT_MODEL,
      originalChars: input.payload.length,
      usedChars: auditInput.length,
    });
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: LLM_BASE_URL,
  });
  const messages = buildAuditMessages(input, auditInput);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: AUDIT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_completion_tokens: MAX_AUDIT_COMPLETION_TOKENS,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new Error("Model returned an empty response.");
      }

      const parsed = parsePossiblyWrappedJson(text);
      const review = sanitizeReview(parsed);

      logger.info("llm.audit.success", {
        provider: LLM_PROVIDER,
        model: AUDIT_MODEL,
        attempt: attempt + 1,
        durationMs: Date.now() - requestStart,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        score: review.score,
        issuesCount: review.issues.length,
        accessibilityFindings: review.accessibility.findings.length,
        seoFindings: review.seo.findings.length,
        visualFindings: review.visual.findings.length,
      });

      return review;
    } catch (error) {
      const isQuotaError =
        error instanceof OpenAI.APIError &&
        (error.status === 429 || error.code === "insufficient_quota" || toErrorMessage(error).includes("exceeded your current quota"));

      const allowFallback = process.env.ALLOW_LLM_FALLBACK !== "false";
      const shouldRetry = !isQuotaError && isRetryableOpenAIError(error) && attempt < MAX_RETRIES;

      if (allowFallback && isQuotaError) {
        logger.warn("llm.audit.fallback_quota", {
          provider: LLM_PROVIDER,
          model: AUDIT_MODEL,
          attempt: attempt + 1,
          durationMs: Date.now() - requestStart,
          errorMessage: toErrorMessage(error),
        });
        return createFallbackReview(auditInput);
      }

      if (shouldRetry) {
        const waitMs = 300 * 2 ** attempt;
        logger.warn("llm.audit.retry", {
          provider: LLM_PROVIDER,
          model: AUDIT_MODEL,
          attempt: attempt + 1,
          waitMs,
          errorMessage: toErrorMessage(error),
        });
        await sleep(waitMs);
        continue;
      }

      logger.error("llm.audit.error", {
        provider: LLM_PROVIDER,
        model: AUDIT_MODEL,
        attempt: attempt + 1,
        durationMs: Date.now() - requestStart,
        errorMessage: toErrorMessage(error),
      });
      throw error;
    }
  }

  throw new Error("LLM audit failed after retries.");
}

export async function runOpenAIHealthCheck(): Promise<"OK" | "ERROR"> {
  const apiKey =
    process.env.LLM_API_KEY ||
    (LLM_PROVIDER === "groq" ? process.env.GROQ_API_KEY : process.env.GROK_API_KEY);
  if (!apiKey) {
    return "ERROR";
  }

  const start = Date.now();

  try {
    const openai = new OpenAI({
      apiKey,
      baseURL: LLM_BASE_URL,
    });
    const completion = await openai.chat.completions.create({
      model: HEALTH_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON with a single key: status." },
        { role: "user", content: "Ping" },
      ],
      max_completion_tokens: 30,
    });

    logger.info("llm.health.success", {
      provider: LLM_PROVIDER,
      model: HEALTH_MODEL,
      durationMs: Date.now() - start,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });

    return "OK";
  } catch (error) {
    logger.warn("llm.health.error", {
      provider: LLM_PROVIDER,
      model: HEALTH_MODEL,
      durationMs: Date.now() - start,
      errorMessage: toErrorMessage(error),
    });
    return "ERROR";
  }
}
