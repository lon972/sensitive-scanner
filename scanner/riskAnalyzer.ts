import type { MatchItem, RiskAssessment, RiskLevel } from "../shared/types.js";

const DEFAULT_SCORE_BY_LEVEL: Record<RiskLevel, number> = {
  high: 18,
  medium: 10,
  low: 4
};

function scoreForMatch(match: MatchItem, level: RiskLevel): number {
  return match.riskScore ?? DEFAULT_SCORE_BY_LEVEL[level];
}

export function assessRisk(matches: MatchItem[]): RiskAssessment {
  let score = 0;
  let maxLevel: RiskLevel = "low";

  for (const match of matches) {
    const level = match.riskLevel ?? "low";
    if (level === "high") {
      score += scoreForMatch(match, level);
      maxLevel = "high";
    } else if (level === "medium") {
      score += scoreForMatch(match, level);
      if (maxLevel !== "high") maxLevel = "medium";
    } else {
      score += scoreForMatch(match, level);
    }
  }

  return {
    score: Math.min(100, score),
    level: maxLevel
  };
}
