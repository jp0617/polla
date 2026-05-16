export type MatchStatus =
  | "SCHEDULED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

export type PredictionStatus = "PENDING" | "LOCKED" | "SCORED";

export interface FootballApiMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  homeTeam: FootballApiTeam;
  awayTeam: FootballApiTeam;
}

export interface FootballApiTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface FootballApiStanding {
  stage: string;
  type: string;
  group: string | null;
  table: FootballApiTableEntry[];
}

export interface FootballApiTableEntry {
  position: number;
  team: FootballApiTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface ScoringResult {
  points: number;
  breakdown: {
    exactScore: boolean;
    correctWinner: boolean;
    bonusTeam: boolean;
  };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  totalPoints: number;
  bonusPoints: number;
  exactScores: number;
  correctWinners: number;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  phone: string;
  favoriteTeamId: string | null;
}
