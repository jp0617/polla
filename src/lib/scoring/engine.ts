import { ScoringResult } from "@/types";

export interface ScoringPoints {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  bonusPhaseAdvance: number;
  exactScoreKO: number;
  correctWinnerKO: number;
  correctAdvancingKO: number;
  advancingPickBonusKO: number;
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
  advancingPickBonusKO: 1,
  bonusPhaseAdvanceKO: 4,
};

const KO_STAGES = new Set(["LAST_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]);

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
 * Knockout scoring:
 * - Predicted draw + result is draw → correctAdvancingKO (4) always
 *   + advancingPickBonusKO (1) if correct advancing team
 *   + exactScoreKO (10) if exact score at 90 or 120 min
 * - Predicted non-draw + exact 90-min score → exactScoreKO (10)
 * - Predicted non-draw + correct advancing team, and the match was NOT
 *   actually a draw (won outright in regular/extra time) → correctWinnerKO (6)
 * - Predicted non-draw + correct advancing team, but the match WAS a draw
 *   at the end of regulation/extra time (decided on penalties) → only
 *   advancingPickBonusKO (1), since the predicted result itself was wrong
 */
export function scoreMatchKO(
  predicted: { home: number; away: number; advancingTeamId: string | null },
  actual: { home: number; away: number; homeScoreET: number | null; awayScoreET: number | null; advancingTeamId: string | null; homeTeamId: string; awayTeamId: string },
  points: ScoringPoints = DEFAULT_POINTS
): ScoringResult {
  // For non-draw results, infer the advancing team from the score if not explicitly set
  const isActualDraw = actual.home === actual.away;
  const inferredAdvancingTeamId = actual.advancingTeamId
    ?? (!isActualDraw
      ? actual.home > actual.away ? actual.homeTeamId : actual.awayTeamId
      : null);

  if (!inferredAdvancingTeamId) {
    // Draw result with no advancing team set yet — can't score
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
    const correctAdvancing = predicted.advancingTeamId === inferredAdvancingTeamId;
    const advancingBonus = correctAdvancing ? points.advancingPickBonusKO : 0;
    const pts = exactScore
      ? points.exactScoreKO + advancingBonus
      : points.correctAdvancingKO + advancingBonus;
    return { points: pts, breakdown: { exactScore, correctWinner: false, bonusTeam: correctAdvancing } };
  }

  // Non-draw prediction: correct if the team they predicted to win actually advanced.
  const predictedSide = predicted.home > predicted.away ? "HOME" : "AWAY";
  const actualAdvancingSide = inferredAdvancingTeamId === actual.homeTeamId ? "HOME" : "AWAY";
  const correctWinner = !exactScore && predictedSide === actualAdvancingSide;

  // Was the match actually a draw at the end of regulation/extra time (i.e. decided on
  // penalties)? Use the 120-min score when available, otherwise the 90-min score.
  const wasActualDraw =
    actual.homeScoreET !== null && actual.awayScoreET !== null
      ? actual.homeScoreET === actual.awayScoreET
      : isActualDraw;

  let pts = 0;
  if (exactScore) pts = points.exactScoreKO;
  else if (correctWinner) pts = wasActualDraw ? points.advancingPickBonusKO : points.correctWinnerKO;

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
