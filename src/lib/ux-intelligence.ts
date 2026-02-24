import type { MotionAnalysis } from "@/lib/motion-intelligence";

export type UXIntelligenceSnapshot = {
  ctaCountAboveFold: number;
  primaryCtaCountAboveFold: number;
  ctaColorVariantCountAboveFold: number;
  heroElementCount: number;
  heroInteractiveCount: number;
  h1DominanceRatio: number;
  ctaVisualDominanceRatio: number;
  flowReadingIssueCount: number;
  leftAlignedKeyElementsRatio: number;
  vagueCtaCount: number;
  benefitCtaCount: number;
  urgencyCtaCount: number;
  maxFormFieldCount: number;
  requiresPhoneAndEmail: boolean;
  progressIndicatorPresent: boolean;
  trustBadgePresent: boolean;
  testimonialsPresent: boolean;
  socialProofPresent: boolean;
  aboutOrContactVisible: boolean;
  hoverFeedbackSignals: number;
  inputFocusSignals: number;
  primaryCtaMinY: number;
  viewportHeight: number;
  menuItemsCount: number;
  navMaxDepth: number;
  hasHamburger: boolean;
  hasVisibleDesktopLikeNav: boolean;
  headlineLength: number;
  hasValuePropHint: boolean;
};

type RiskLevel = "Low" | "Medium" | "High";

type CognitiveLoadAnalysis = {
  cta_count_above_fold: number;
  primary_cta_conflict: boolean;
  competing_color_count: number;
  overcrowded_hero: boolean;
  risk: string;
  cognitive_load_index: number;
};

type VisualHierarchyAnalysis = {
  h1_dominance_ratio: number;
  cta_visual_dominance_ratio: number;
  color_hierarchy_score: number;
  visual_dominance_ratio: number;
  score: number;
};

type FlowAnalysis = {
  estimated_pattern: "f-pattern" | "z-pattern" | "mixed";
  reading_flow_score: number;
  reading_order_issues: number;
  cta_scan_risk: boolean;
};

type CTAQualityAnalysis = {
  vague_cta_count: number;
  benefit_cta_count: number;
  urgency_cta_count: number;
  cta_strength_score: number;
  findings: string[];
};

type ConversionFrictionAnalysis = {
  max_form_fields: number;
  form_fields_over_8: boolean;
  requires_phone_and_email: boolean;
  missing_progress_indicator: boolean;
  trust_badge_missing_on_checkout: boolean;
  conversion_friction_score: number;
  findings: string[];
};

type TrustSignalAnalysis = {
  testimonials_present: boolean;
  social_proof_present: boolean;
  security_badges_present: boolean;
  about_or_contact_visible: boolean;
  trust_score: number;
};

type ExperienceQualityAnalysis = {
  microinteraction_score: number;
  cta_visibility_score: number;
  navigation_simplicity_score: number;
  findings: string[];
};

type UXRiskRadar = {
  clarity: number;
  conversion: number;
  trust: number;
  content: number;
  interaction: number;
  navigation: number;
};

export type UXIntelligenceAnalysis = {
  cognitive_load: CognitiveLoadAnalysis;
  visual_hierarchy: VisualHierarchyAnalysis;
  flow_analysis: FlowAnalysis;
  cta_quality: CTAQualityAnalysis;
  conversion_friction: ConversionFrictionAnalysis;
  trust_signals: TrustSignalAnalysis;
  experience_quality: ExperienceQualityAnalysis;
  first_impression_score: number;
  ux_risk_radar: UXRiskRadar;
  risk_level: RiskLevel;
  findings: string[];
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function analyzeCognitiveLoad(snapshot: UXIntelligenceSnapshot): CognitiveLoadAnalysis {
  const primaryConflict = snapshot.primaryCtaCountAboveFold >= 3;
  const overcrowdedHero = snapshot.heroElementCount >= 14 || snapshot.heroInteractiveCount >= 5;

  let index = 0;
  index += Math.min(35, Math.max(0, snapshot.ctaCountAboveFold - 1) * 10);
  index += primaryConflict ? 20 : 0;
  index += Math.min(20, Math.max(0, snapshot.ctaColorVariantCountAboveFold - 2) * 8);
  index += overcrowdedHero ? 20 : 0;

  const load = clamp(index);
  return {
    cta_count_above_fold: snapshot.ctaCountAboveFold,
    primary_cta_conflict: primaryConflict,
    competing_color_count: snapshot.ctaColorVariantCountAboveFold,
    overcrowded_hero: overcrowdedHero,
    risk: `${toRiskLevel(load)} cognitive load in hero section`,
    cognitive_load_index: load,
  };
}

function analyzeVisualHierarchy(snapshot: UXIntelligenceSnapshot): VisualHierarchyAnalysis {
  const colorHierarchyScore = clamp(100 - Math.max(0, snapshot.ctaColorVariantCountAboveFold - 2) * 15);
  const h1RatioPercent = clamp(snapshot.h1DominanceRatio * 100);
  const ctaRatioPercent = clamp(snapshot.ctaVisualDominanceRatio * 100);

  const score = clamp(
    h1RatioPercent * 0.4 +
      ctaRatioPercent * 0.4 +
      colorHierarchyScore * 0.2,
  );

  return {
    h1_dominance_ratio: Number(snapshot.h1DominanceRatio.toFixed(2)),
    cta_visual_dominance_ratio: Number(snapshot.ctaVisualDominanceRatio.toFixed(2)),
    color_hierarchy_score: colorHierarchyScore,
    visual_dominance_ratio: clamp((h1RatioPercent + ctaRatioPercent) / 2),
    score,
  };
}

function analyzeFlow(snapshot: UXIntelligenceSnapshot): FlowAnalysis {
  const leftBias = snapshot.leftAlignedKeyElementsRatio;
  const pattern: "f-pattern" | "z-pattern" | "mixed" =
    leftBias >= 0.7 ? "f-pattern" : leftBias >= 0.45 ? "z-pattern" : "mixed";

  const readingFlowScore = clamp(
    100 - snapshot.flowReadingIssueCount * 14 + (leftBias >= 0.5 ? 8 : 0),
  );

  return {
    estimated_pattern: pattern,
    reading_flow_score: readingFlowScore,
    reading_order_issues: snapshot.flowReadingIssueCount,
    cta_scan_risk: readingFlowScore < 60,
  };
}

function analyzeCTAQuality(snapshot: UXIntelligenceSnapshot): CTAQualityAnalysis {
  let strength = 60;
  strength += Math.min(25, snapshot.benefitCtaCount * 8);
  strength += Math.min(10, snapshot.urgencyCtaCount * 4);
  strength -= Math.min(35, snapshot.vagueCtaCount * 9);
  const score = clamp(strength);

  const findings: string[] = [];
  if (snapshot.vagueCtaCount > 0) {
    findings.push("CTA lacks benefit framing. Consider adding outcome-driven language.");
  }
  if (snapshot.benefitCtaCount === 0) {
    findings.push("No benefit-driven CTA detected above the fold.");
  }
  if (snapshot.urgencyCtaCount === 0 && snapshot.primaryCtaCountAboveFold > 0) {
    findings.push("Primary CTA has weak urgency cues.");
  }

  return {
    vague_cta_count: snapshot.vagueCtaCount,
    benefit_cta_count: snapshot.benefitCtaCount,
    urgency_cta_count: snapshot.urgencyCtaCount,
    cta_strength_score: score,
    findings,
  };
}

function analyzeConversionFriction(snapshot: UXIntelligenceSnapshot): ConversionFrictionAnalysis {
  let friction = 20;
  friction += snapshot.maxFormFieldCount > 8 ? 25 : 0;
  friction += snapshot.requiresPhoneAndEmail ? 22 : 0;
  friction += snapshot.progressIndicatorPresent ? 0 : 15;
  friction += snapshot.trustBadgePresent ? 0 : 10;

  const findings: string[] = [];
  if (snapshot.maxFormFieldCount > 8) findings.push("Form has more than 8 fields; likely conversion drop.");
  if (snapshot.requiresPhoneAndEmail) findings.push("Form asks both phone and email; high perceived effort.");
  if (!snapshot.progressIndicatorPresent && snapshot.maxFormFieldCount >= 6) findings.push("Multi-step style form lacks progress indicator.");
  if (!snapshot.trustBadgePresent && snapshot.maxFormFieldCount >= 4) findings.push("Trust/security indicator missing near conversion path.");

  return {
    max_form_fields: snapshot.maxFormFieldCount,
    form_fields_over_8: snapshot.maxFormFieldCount > 8,
    requires_phone_and_email: snapshot.requiresPhoneAndEmail,
    missing_progress_indicator: !snapshot.progressIndicatorPresent,
    trust_badge_missing_on_checkout: !snapshot.trustBadgePresent,
    conversion_friction_score: clamp(friction),
    findings,
  };
}

function analyzeTrustSignals(snapshot: UXIntelligenceSnapshot): TrustSignalAnalysis {
  let trust = 25;
  trust += snapshot.testimonialsPresent ? 25 : 0;
  trust += snapshot.socialProofPresent ? 20 : 0;
  trust += snapshot.trustBadgePresent ? 20 : 0;
  trust += snapshot.aboutOrContactVisible ? 20 : 0;

  return {
    testimonials_present: snapshot.testimonialsPresent,
    social_proof_present: snapshot.socialProofPresent,
    security_badges_present: snapshot.trustBadgePresent,
    about_or_contact_visible: snapshot.aboutOrContactVisible,
    trust_score: clamp(trust),
  };
}

function analyzeExperienceQuality(snapshot: UXIntelligenceSnapshot): ExperienceQualityAnalysis {
  const microinteractionScore = clamp(45 + snapshot.hoverFeedbackSignals * 8 + snapshot.inputFocusSignals * 10);
  const ctaVisibilityScore = clamp(
    snapshot.viewportHeight > 0
      ? 100 - Math.max(0, ((snapshot.primaryCtaMinY - snapshot.viewportHeight) / snapshot.viewportHeight) * 70)
      : 60,
  );

  const navigationComplexityPenalty =
    Math.max(0, snapshot.menuItemsCount - 7) * 5 +
    Math.max(0, snapshot.navMaxDepth - 2) * 12 +
    (snapshot.hasHamburger && snapshot.hasVisibleDesktopLikeNav ? 10 : 0);

  const navigationSimplicityScore = clamp(100 - navigationComplexityPenalty);

  const findings: string[] = [];
  if (ctaVisibilityScore < 65) findings.push("Important CTA appears too deep in scroll path.");
  if (navigationSimplicityScore < 60) findings.push("Navigation complexity may increase cognitive overhead.");
  if (microinteractionScore < 50) findings.push("Limited hover/focus feedback detected for interactive elements.");

  return {
    microinteraction_score: microinteractionScore,
    cta_visibility_score: ctaVisibilityScore,
    navigation_simplicity_score: navigationSimplicityScore,
    findings,
  };
}

export function analyzeUXIntelligence(
  snapshot: UXIntelligenceSnapshot,
  options?: {
    motionAnalysis?: MotionAnalysis;
    readabilityScore?: number;
  },
): UXIntelligenceAnalysis {
  const cognitive = analyzeCognitiveLoad(snapshot);
  const hierarchy = analyzeVisualHierarchy(snapshot);
  const flow = analyzeFlow(snapshot);
  const cta = analyzeCTAQuality(snapshot);
  const friction = analyzeConversionFriction(snapshot);
  const trust = analyzeTrustSignals(snapshot);
  const experience = analyzeExperienceQuality(snapshot);

  const headlineClarity = snapshot.headlineLength > 20 && snapshot.headlineLength < 85 ? 80 : 55;
  const valuePropScore = snapshot.hasValuePropHint ? 85 : 55;
  const firstImpressionScore = clamp(
    headlineClarity * 0.2 +
      valuePropScore * 0.2 +
      cta.cta_strength_score * 0.2 +
      (100 - cognitive.cognitive_load_index) * 0.2 +
      hierarchy.score * 0.2,
  );

  const radar: UXRiskRadar = {
    clarity: clamp((100 - cognitive.cognitive_load_index) * 0.5 + hierarchy.score * 0.5),
    conversion: clamp((100 - friction.conversion_friction_score) * 0.6 + cta.cta_strength_score * 0.4),
    trust: trust.trust_score,
    content: clamp(options?.readabilityScore ?? 60),
    interaction: clamp((100 - (options?.motionAnalysis?.risk_score ?? 40)) * 0.5 + experience.microinteraction_score * 0.5),
    navigation: clamp(flow.reading_flow_score * 0.5 + experience.navigation_simplicity_score * 0.5),
  };

  const overallRisk = clamp(
    cognitive.cognitive_load_index * 0.2 +
      friction.conversion_friction_score * 0.25 +
      (100 - trust.trust_score) * 0.2 +
      (100 - cta.cta_strength_score) * 0.15 +
      (100 - flow.reading_flow_score) * 0.2,
  );

  const findings = unique([
    cognitive.primary_cta_conflict ? "Multiple primary CTAs above the fold are creating decision fatigue." : "",
    cognitive.overcrowded_hero ? "Hero section appears visually crowded and may reduce message clarity." : "",
    ...cta.findings,
    ...friction.findings,
    ...experience.findings,
    !trust.about_or_contact_visible ? "About/Contact visibility is weak; trust confidence may drop." : "",
    firstImpressionScore < 65 ? "First impression is weak in the first 5-second scan." : "",
  ]).slice(0, 8);

  return {
    cognitive_load: cognitive,
    visual_hierarchy: hierarchy,
    flow_analysis: flow,
    cta_quality: cta,
    conversion_friction: friction,
    trust_signals: trust,
    experience_quality: experience,
    first_impression_score: firstImpressionScore,
    ux_risk_radar: radar,
    risk_level: toRiskLevel(overallRisk),
    findings,
  };
}
