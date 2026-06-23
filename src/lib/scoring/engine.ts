import { ScoringResult } from "@/types";

export interface ScoringPoints {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  bonusPhaseAdvance: number;
  exactScoreKO: number;
  correctWinnerKO: number;
  correctAdvancingKO: number;
  bonusPhaseAdvanceKO: number;
}

export const DEFAULT_POINTS: ScoringPoints = {
  exactScore: 5,
  correctWinner: 3,
  correctDraw: 2,
  bonusPhaseAdvance: 2,
  exactScoreKO: 10,
  correctWinnerKO: 6,
  correctAdvancingKO: 4,
  bonusPhaseAdvanceKO: 4,
};

const KO_STAGES = new Set(["ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]);

export function isKnockoutStage(stage: string): boolean {
  return KO_STAGES.has(stage);
}

export function scoreMatch(
  predicted: { home: number; away: number },
  actual: { home: number; away: number },
  points: ScoringPoints = DEFAULT_POINTS
): ScoringResult {
  const exactScore =
    predicted.home === actual.home && predicted.away === actual.away;

  const predictedWinner = getWinner(predicted.home, predicted.away);
  const actualWinner = getWinner(actual.home, actual.away);
  const correctWinner = !exactScore && predictedWinner === actualWinner && actualWinner !== "DRAW";
  const correctDraw = !exactScore && predictedWinner === "DRAW" && actualWinner === "DRAW";

  let pts = 0;
  if (exactScore) pts = points.exactScore;
  else if (correctWinner) pts = points.correctWinner;
  else if (correctDraw) pts = points.correctDraw;

  return {
    points: pts,
    breakdown: { exactScore, correctWinner, bonusTeam: false },
  };
}

/**
 * Knockout scoring — three distinct cases:
 * 1. Predicted non-draw, exact 90-min score → exactScoreKO
 * 2. Predicted non-draw, correct advancing team (90 or 120 min) → correctWinnerKO
 * 3. Predicted draw + correct advancing team:
 *    - Also exact score → exactScoreKO + correctAdvancingKO
 *    - Only advancing team correct → correctAdvancingKO
 */
export function scoreMatchKO(
  predicted: { home: number; away: number; advancingTeamId: string | null },
  actual: { home: number; away: number; homeScoreET: number | null; awayScoreET: number | null; advancingTeamId: string | null; homeTeamId: string; awayTeamId: string },
  points: ScoringPoints = DEFAULT_POINTS
): ScoringResult {
  if (!actual.advancingTeamId) {
    return { points: 0, breakdown: { exactScore: false, correctWinner: false, bonusTeam: false } };
  }

  const exactScore90 = predicted.home === actual.home && predicted.away === actual.away;
  const exactScoreET =
    actual.homeScoreET !== null &&
    actual.awayScoreET !== null &&
    predicted.home === actual.homeScoreET &&
    predicted.away === actual.awayScoreET;
  const exactScore = exactScore90 || exactScoreET;
  const predictedDraw = predicted.home === predicted.away;

  if (predictedDraw) {
    const correctAdvancing = predicted.advancingTeamId === actual.advancingTeamId;
    if (!correctAdvancing) return { points: 0, breakdown: { exactScore: false, correctWinner: false, bonusTeam: false } };
    const pts = exactScore ? points.exactScoreKO + points.correctAdvancingKO : points.correctAdvancingKO;
    return { points: pts, breakdown: { exactScore, correctWinner: false, bonusTeam: false } };
  }

  // Non-draw prediction: the user predicted one side to win.
  // "Correct winner" = the team they predicted to win actually advanced (covers 90min + ET/pens).
  const predictedSide = predicted.home > predicted.away ? "HOME" : "AWAY";
  const actualAdvancingSide = actual.advancingTeamId === actual.homeTeamId ? "HOME" : "AWAY";
  const correctWinner = !exactScore && predictedSide === actualAdvancingSide;

  let pts = 0;
  if (exactScore) pts = points.exactScoreKO;
  else if (correctWinner) pts = points.correctWinnerKO;

  return { points: pts, breakdown: { exactScore, correctWinner, bonusTeam: false } };
}

function getWinner(home: number, away: number): "HOME" | "AWAY" | "DRAW" {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

export function isPredictionLocked(kickoff: Date, lockMinutes = 5): boolean {
  const now = new Date();
  const lockTime = new Date(kickoff.getTime() - lockMinutes * 60 * 1000);
  return now >= lockTime;
}
