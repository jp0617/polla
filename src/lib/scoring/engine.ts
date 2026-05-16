import { ScoringResult } from "@/types";

export interface ScoringPoints {
  exactScore: number;
  correctWinner: number;
  bonusPhaseAdvance: number;
}

export const DEFAULT_POINTS: ScoringPoints = {
  exactScore: 5,
  correctWinner: 3,
  bonusPhaseAdvance: 2,
};

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

  let pts = 0;
  if (exactScore) pts = points.exactScore;
  else if (correctWinner) pts = points.correctWinner;

  return {
    points: pts,
    breakdown: { exactScore, correctWinner, bonusTeam: false },
  };
}

function getWinner(home: number, away: number): "HOME" | "AWAY" | "DRAW" {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

export function isPredictionLocked(kickoff: Date): boolean {
  const now = new Date();
  const lockTime = new Date(kickoff.getTime() - 5 * 60 * 1000);
  return now >= lockTime;
}
