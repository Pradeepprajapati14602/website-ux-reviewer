type KeywordPlacement = {
  in_h1: boolean;
  in_first_100_words: boolean;
  in_meta: boolean;
  subheading_matches: number;
};

type PrimaryKeywordAnalysis = {
  keyword: string;
  keyword_count: number;
  density: number;
  recommended_density_range: string;
  placement: KeywordPlacement;
  stuffing_risk: "low" | "medium" | "high";
  repeated_phrase_flags: string[];
};

type StructureAnalysis = {
  long_paragraphs: number;
  wall_of_text_paragraphs: number;
  no_subheading_after_300_words: boolean;
  bullet_list_presence: boolean;
  passive_voice_percent: number;
  long_sentence_percent: number;
  complex_sentence_percent: number;
};

export type SEOContentAnalysis = {
  word_count: number;
  sentence_count: number;
  avg_sentence_length: number;
  readability_score: number;
  primary_keyword_analysis: PrimaryKeywordAnalysis;
  structure_analysis: StructureAnalysis;
  semantic_coverage_score: number;
  intent_alignment_score: number;
  findings: string[];
};

type AnalyzeContentInput = {
  title: string;
  headings: string[];
  mainText: string;
  metaDescription?: string;
  h1Text?: string;
  subheadings?: string[];
  primaryKeyword?: string;
};

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "for", "with", "of", "in", "on", "at", "and", "or", "is", "are", "your", "you", "our",
]);

const INTENT_PATTERNS = {
  transactional: /(buy|price|pricing|book|order|quote|demo|trial|plan|plans|subscribe|purchase)/i,
  informational: /(what is|how to|guide|tips|learn|overview|benefits|why|blog|article)/i,
  navigational: /(login|sign in|contact|about|location|address|support|help|near me)/i,
};

function toWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  const byBreakLine = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (byBreakLine.length > 1) {
    return byBreakLine;
  }

  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function estimateSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);

  return Math.max(1, groups?.length || 1);
}

function fleschScore(sentences: string[], words: string[]): number {
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }

  const syllables = words.reduce((sum, word) => sum + estimateSyllables(word), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
}

function extractPrimaryKeyword(input: AnalyzeContentInput): string {
  if (input.primaryKeyword?.trim()) {
    return input.primaryKeyword.trim().toLowerCase();
  }

  const source = input.h1Text || input.title || "";
  const words = toWords(source).filter((word) => !STOP_WORDS.has(word));
  return words.slice(0, Math.min(4, words.length)).join(" ") || "";
}

function countPhraseOccurrences(text: string, phrase: string): number {
  if (!phrase) return 0;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.toLowerCase().match(new RegExp(`\\b${escaped}\\b`, "g"));
  return matches?.length || 0;
}

function detectRepeatedPhrases(text: string, minWords = 3): string[] {
  const words = toWords(text);
  const counts = new Map<string, number>();

  for (let index = 0; index <= words.length - minWords; index++) {
    const phrase = words.slice(index, index + minWords).join(" ");
    if (phrase.split(" ").some((word) => STOP_WORDS.has(word))) {
      continue;
    }
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);
}

function inferRelatedTerms(keyword: string): string[] {
  const map: Record<string, string[]> = {
    booking: ["scheduling", "appointments", "calendar", "automation", "booking management"],
    software: ["platform", "dashboard", "integration", "workflow", "system"],
    ecommerce: ["checkout", "cart", "payment", "conversion", "catalog"],
    seo: ["ranking", "keywords", "backlinks", "search intent", "content quality"],
  };

  const terms = new Set<string>();
  const keywordWords = toWords(keyword);

  for (const keywordWord of keywordWords) {
    for (const [token, values] of Object.entries(map)) {
      if (keywordWord.includes(token) || token.includes(keywordWord)) {
        values.forEach((value) => terms.add(value));
      }
    }
  }

  if (terms.size === 0) {
    keywordWords.forEach((value) => terms.add(value));
  }

  return [...terms];
}

function matchIntent(text: string): "transactional" | "informational" | "navigational" | "mixed" {
  const candidates = [
    { name: "transactional", regex: INTENT_PATTERNS.transactional },
    { name: "informational", regex: INTENT_PATTERNS.informational },
    { name: "navigational", regex: INTENT_PATTERNS.navigational },
  ] as const;

  const hits = candidates.filter((candidate) => candidate.regex.test(text));
  if (hits.length === 1) {
    return hits[0].name;
  }
  if (hits.length === 0) {
    return "mixed";
  }

  return "mixed";
}

function detectPassiveVoice(sentences: string[]): number {
  if (sentences.length === 0) {
    return 0;
  }

  const passiveCount = sentences.filter((sentence) => /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/i.test(sentence)).length;
  return Number(((passiveCount / sentences.length) * 100).toFixed(1));
}

function complexityPercent(sentences: string[], threshold: number): number {
  if (sentences.length === 0) {
    return 0;
  }

  const longCount = sentences.filter((sentence) => toWords(sentence).length > threshold).length;
  return Number(((longCount / sentences.length) * 100).toFixed(1));
}

function averageSentenceLength(sentences: string[]): number {
  if (sentences.length === 0) {
    return 0;
  }

  const totalWords = sentences.reduce((sum, sentence) => sum + toWords(sentence).length, 0);
  return Number((totalWords / sentences.length).toFixed(1));
}

export function analyzeSEOContent(input: AnalyzeContentInput): SEOContentAnalysis {
  const text = input.mainText || "";
  const words = toWords(text);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const first100Words = words.slice(0, 100).join(" ");

  const keyword = extractPrimaryKeyword(input);
  const keywordCount = countPhraseOccurrences(text, keyword);
  const density = words.length > 0 ? Number(((keywordCount / words.length) * 100).toFixed(2)) : 0;

  const h1Source = (input.h1Text || input.headings[0] || "").toLowerCase();
  const subheadings = (input.subheadings && input.subheadings.length > 0
    ? input.subheadings
    : input.headings.filter((_, index) => index > 0)
  ).map((item) => item.toLowerCase());

  const placement: KeywordPlacement = {
    in_h1: keyword ? h1Source.includes(keyword) : false,
    in_first_100_words: keyword ? first100Words.includes(keyword) : false,
    in_meta: keyword ? (input.metaDescription || "").toLowerCase().includes(keyword) : false,
    subheading_matches: keyword ? subheadings.filter((item) => item.includes(keyword)).length : 0,
  };

  const repeatedPhrases = detectRepeatedPhrases(text);
  const stuffingRisk: "low" | "medium" | "high" = density > 2.6 || repeatedPhrases.length >= 4 ? "high" : density > 1.8 || repeatedPhrases.length >= 2 ? "medium" : "low";

  const avgSentenceLength = averageSentenceLength(sentences);
  const passiveVoicePercent = detectPassiveVoice(sentences);
  const longSentencePercent = complexityPercent(sentences, 25);
  const complexSentencePercent = complexityPercent(sentences, 20);
  const readabilityScore = fleschScore(sentences, words);

  const paragraphWordLengths = paragraphs.map((paragraph) => toWords(paragraph).length);
  const longParagraphs = paragraphWordLengths.filter((count) => count > 150).length;
  const wallOfTextParagraphs = paragraphWordLengths.filter((count) => count > 220).length;
  const noSubheadingAfter300Words = words.length >= 300 && subheadings.length === 0;
  const bulletListPresence = /\n\s*[-*•]\s+/.test(input.mainText || "") || /\b(first|second|third|steps?|checklist)\b/i.test(input.mainText || "");

  const relatedTerms = inferRelatedTerms(keyword);
  const relatedMatches = relatedTerms.filter((term) => (input.mainText || "").toLowerCase().includes(term.toLowerCase()));
  const semanticCoverageScore = relatedTerms.length > 0
    ? Math.round((relatedMatches.length / relatedTerms.length) * 100)
    : 0;

  const titleIntent = matchIntent(input.title || "");
  const contentIntent = matchIntent(input.mainText || "");
  const intentAlignmentScore = titleIntent === "mixed" || contentIntent === "mixed"
    ? 75
    : titleIntent === contentIntent
      ? 90
      : 45;

  const findings: string[] = [];

  if (density < 0.8) {
    findings.push(`Primary keyword density is ${density}% (recommended 0.8–1.5%).`);
  } else if (density > 1.6) {
    findings.push(`Primary keyword density is ${density}% and may feel repetitive.`);
  }

  if (!placement.in_meta) {
    findings.push("Primary keyword is missing from meta description.");
  }

  if (longSentencePercent > 25) {
    findings.push(`${longSentencePercent}% sentences exceed 25 words; split long paragraphs.`);
  }

  if (passiveVoicePercent > 10) {
    findings.push(`Passive voice is ${passiveVoicePercent}% (target below 10%).`);
  }

  if (longParagraphs > 0) {
    findings.push(`${longParagraphs} paragraph(s) exceed 150 words.`);
  }

  if (semanticCoverageScore < 45) {
    findings.push("Semantic coverage is low; add related terms to improve topical depth.");
  }

  if (intentAlignmentScore < 60) {
    findings.push("Intent mismatch detected between title/keyword and body content style.");
  }

  return {
    word_count: words.length,
    sentence_count: sentences.length,
    avg_sentence_length: avgSentenceLength,
    readability_score: readabilityScore,
    primary_keyword_analysis: {
      keyword,
      keyword_count: keywordCount,
      density,
      recommended_density_range: "0.8-1.5",
      placement,
      stuffing_risk: stuffingRisk,
      repeated_phrase_flags: repeatedPhrases,
    },
    structure_analysis: {
      long_paragraphs: longParagraphs,
      wall_of_text_paragraphs: wallOfTextParagraphs,
      no_subheading_after_300_words: noSubheadingAfter300Words,
      bullet_list_presence: bulletListPresence,
      passive_voice_percent: passiveVoicePercent,
      long_sentence_percent: longSentencePercent,
      complex_sentence_percent: complexSentencePercent,
    },
    semantic_coverage_score: semanticCoverageScore,
    intent_alignment_score: intentAlignmentScore,
    findings,
  };
}
