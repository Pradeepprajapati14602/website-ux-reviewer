import type { PerformanceReport } from "@/lib/performance";

export type MotionType = "css" | "js" | "scroll" | "carousel" | "lottie" | "video";

export type MotionDetectionSnapshot = {
  cssAnimations: number;
  cssTransitions: number;
  jsAnimationHooks: number;
  scrollRevealElements: number;
  autoCarousels: number;
  lottieInstances: number;
  videoLikeAnimations: number;
  infiniteAnimations: number;
  longDurationAnimations: number;
  reducedMotionSupport: boolean;
  pauseControlPresent: boolean;
  flashingRisk: boolean;
  lcpElementLikelyAnimated: boolean;
  potentialRisks: string[];
};

export type MotionAnalysis = {
  animation_count: number;
  animations_detected: number;
  types: MotionType[];
  infinite_animations: number;
  auto_carousels: number;
  scroll_reveal_elements: number;
  long_duration_animations: number;
  accessibility_support: boolean;
  reduced_motion_css_present: boolean;
  pause_control_present: boolean;
  flashing_risk: boolean;
  lcp_element_likely_animated: boolean;
  potential_risks: string[];
  performance_correlation: string[];
  risk_score: number;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function analyzeMotionSignals(snapshot: MotionDetectionSnapshot): MotionAnalysis {
  const types: MotionType[] = [];

  if (snapshot.cssAnimations > 0 || snapshot.cssTransitions > 0) {
    types.push("css");
  }
  if (snapshot.jsAnimationHooks > 0) {
    types.push("js");
  }
  if (snapshot.scrollRevealElements > 0) {
    types.push("scroll");
  }
  if (snapshot.autoCarousels > 0) {
    types.push("carousel");
  }
  if (snapshot.lottieInstances > 0) {
    types.push("lottie");
  }
  if (snapshot.videoLikeAnimations > 0) {
    types.push("video");
  }

  const animationCount =
    snapshot.cssAnimations +
    snapshot.cssTransitions +
    snapshot.jsAnimationHooks +
    snapshot.scrollRevealElements +
    snapshot.autoCarousels +
    snapshot.lottieInstances +
    snapshot.videoLikeAnimations;

  let riskScore = 0;
  riskScore += Math.min(20, snapshot.autoCarousels * 12);
  riskScore += Math.min(18, snapshot.infiniteAnimations * 4);
  riskScore += Math.min(14, snapshot.longDurationAnimations * 4);
  riskScore += Math.min(8, Math.max(0, snapshot.scrollRevealElements - 2) * 2);
  riskScore += snapshot.flashingRisk ? 24 : 0;
  riskScore += snapshot.lcpElementLikelyAnimated ? 10 : 0;
  riskScore += snapshot.reducedMotionSupport ? 0 : 12;
  riskScore += snapshot.pauseControlPresent ? 0 : snapshot.autoCarousels > 0 ? 8 : 0;

  if (snapshot.reducedMotionSupport && snapshot.pauseControlPresent) {
    riskScore -= 6;
  }

  const potentialRisks = unique(snapshot.potentialRisks);

  return {
    animation_count: animationCount,
    animations_detected: animationCount,
    types,
    infinite_animations: snapshot.infiniteAnimations,
    auto_carousels: snapshot.autoCarousels,
    scroll_reveal_elements: snapshot.scrollRevealElements,
    long_duration_animations: snapshot.longDurationAnimations,
    accessibility_support: snapshot.reducedMotionSupport && (snapshot.pauseControlPresent || snapshot.autoCarousels === 0),
    reduced_motion_css_present: snapshot.reducedMotionSupport,
    pause_control_present: snapshot.pauseControlPresent,
    flashing_risk: snapshot.flashingRisk,
    lcp_element_likely_animated: snapshot.lcpElementLikelyAnimated,
    potential_risks: potentialRisks,
    performance_correlation: [],
    risk_score: clamp(riskScore),
  };
}

function findPerformanceMetric(report: PerformanceReport, metricId: string): { score: number; displayValue: string } | null {
  const metric = report.performance.metrics.find((item) => item.id === metricId);
  if (!metric) {
    return null;
  }

  return {
    score: metric.score,
    displayValue: metric.displayValue,
  };
}

export function correlateMotionWithPerformance(
  analysis: MotionAnalysis,
  performance: PerformanceReport,
): MotionAnalysis {
  const cls = findPerformanceMetric(performance, "cumulative-layout-shift");
  const lcp = findPerformanceMetric(performance, "largest-contentful-paint");
  const performanceCorrelation = [...analysis.performance_correlation];
  let riskScore = analysis.risk_score;

  if (cls && cls.score < 75 && (analysis.infinite_animations > 0 || analysis.auto_carousels > 0 || analysis.scroll_reveal_elements > 0)) {
    performanceCorrelation.push(
      `High-motion sections align with weaker CLS (${cls.displayValue}); check animated hero/reveal blocks for layout instability.`,
    );
    riskScore += 8;
  }

  if (lcp && lcp.score < 75 && analysis.lcp_element_likely_animated) {
    performanceCorrelation.push(
      `Likely animated hero/LCP candidate with slower LCP (${lcp.displayValue}); reduce intro motion on first viewport.`,
    );
    riskScore += 10;
  }

  return {
    ...analysis,
    performance_correlation: unique(performanceCorrelation),
    risk_score: clamp(riskScore),
  };
}
