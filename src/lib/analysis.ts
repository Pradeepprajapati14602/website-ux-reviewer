import OpenAI from "openai";
import { UX_AUDIT_PROMPT } from "@/lib/prompt";

export type UXCategory = "clarity" | "layout" | "navigation" | "accessibility" | "trust";
export type UXSeverity = "low" | "medium" | "high";

export type UXIssue = {
  category: UXCategory;
  title: string;
  why: string;
  evidence: string;
  severity: UXSeverity;
};

export type UXImprovement = {
  before: string;
  after: string;
};

export type UXReview = {
  score: number;
  issues: UXIssue[];
  top_improvements: UXImprovement[];
};

const allowedCategories: UXCategory[] = ["clarity", "layout", "navigation", "accessibility", "trust"];
const allowedSeverity: UXSeverity[] = ["low", "medium", "high"];

function extractSection(content: string, key: string): string {
  const match = content.match(new RegExp(`${key}:\\s*(.*)`, "i"));
  return match?.[1]?.trim() || "";
}

function extractEvidence(content: string, key: string): string {
  const value = extractSection(content, key);
  if (!value || value === "None") {
    return "No clear evidence found in extracted text.";
  }
  return value.slice(0, 140);
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

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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

function createFallbackReview(content: string): UXReview {
  const title = extractEvidence(content, "TITLE");
  const headings = extractEvidence(content, "HEADINGS");
  const buttons = extractEvidence(content, "BUTTONS");
  const forms = extractEvidence(content, "FORMS");
  const mainText = extractEvidence(content, "MAIN_TEXT");

  return {
    score: calculateFallbackScore(content),
    issues: [
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
      {
        category: "navigation",
        title: "Action labels may be generic",
        why: "Generic CTA text can lower click confidence.",
        evidence: buttons,
        severity: "low",
      },
      {
        category: "accessibility",
        title: "Potential keyboard/screen-reader friction",
        why: "Without explicit semantic cues, assistive navigation may suffer.",
        evidence: headings,
        severity: "medium",
      },
    ],
    top_improvements: [
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
    ],
  };
}

function parsePossiblyWrappedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response did not contain JSON.");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function sanitizeReview(input: unknown): UXReview {
  const source = (input ?? {}) as Record<string, unknown>;
  const rawScore = Number(source.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;

  const rawIssues = Array.isArray(source.issues) ? source.issues : [];
  const issues: UXIssue[] = rawIssues
    .map((issue): UXIssue | null => {
      if (!issue || typeof issue !== "object") {
        return null;
      }

      const item = issue as Record<string, unknown>;
      const category = String(item.category || "clarity").toLowerCase() as UXCategory;
      const severity = String(item.severity || "medium").toLowerCase() as UXSeverity;

      return {
        category: allowedCategories.includes(category) ? category : "clarity",
        title: String(item.title || "Untitled issue").trim(),
        why: String(item.why || "No explanation provided.").trim(),
        evidence: String(item.evidence || "").trim(),
        severity: allowedSeverity.includes(severity) ? severity : "medium",
      };
    })
    .filter((issue): issue is UXIssue => Boolean(issue))
    .slice(0, 12);

  const rawImprovements = Array.isArray(source.top_improvements) ? source.top_improvements : [];
  const top_improvements: UXImprovement[] = rawImprovements
    .map((improvement): UXImprovement | null => {
      if (!improvement || typeof improvement !== "object") {
        return null;
      }
      const item = improvement as Record<string, unknown>;
      return {
        before: String(item.before || "").trim(),
        after: String(item.after || "").trim(),
      };
    })
    .filter((improvement): improvement is UXImprovement => Boolean(improvement))
    .slice(0, 3);

  return {
    score,
    issues,
    top_improvements,
  };
}

export async function runUxAudit(content: string): Promise<UXReview> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const openai = new OpenAI({ apiKey });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: UX_AUDIT_PROMPT },
        { role: "user", content },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error("Model returned an empty response.");
    }

    const parsed = parsePossiblyWrappedJson(text);
    return sanitizeReview(parsed);
  } catch (error) {
    const isQuotaError =
      error instanceof OpenAI.APIError &&
      (error.status === 429 || error.code === "insufficient_quota" || error.message.includes("exceeded your current quota"));

    const allowFallback = process.env.ALLOW_LLM_FALLBACK !== "false";

    if (allowFallback && isQuotaError) {
      return createFallbackReview(content);
    }

    throw error;
  }
}

export async function runOpenAIHealthCheck(): Promise<"OK" | "ERROR"> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "ERROR";
  }

  try {
    const openai = new OpenAI({ apiKey });
    await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON with a single key: status." },
        { role: "user", content: "Ping" },
      ],
      max_completion_tokens: 30,
    });
    return "OK";
  } catch {
    return "ERROR";
  }
}