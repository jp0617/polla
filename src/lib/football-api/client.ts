import { FootballApiMatch, FootballApiStanding } from "@/types";

const BASE_URL =
  process.env.FOOTBALL_API_BASE_URL || "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_API_KEY || "";
const COMPETITION_ID = process.env.FOOTBALL_COMPETITION_ID || "2000"; // World Cup 2026

const headers = {
  "X-Auth-Token": API_KEY,
};

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Football API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function getCompetitionMatches(): Promise<FootballApiMatch[]> {
  const data = await fetchApi<{ matches: FootballApiMatch[] }>(
    `/competitions/${COMPETITION_ID}/matches`
  );
  return data.matches;
}

export async function getMatchById(
  matchId: number
): Promise<FootballApiMatch> {
  return fetchApi<FootballApiMatch>(`/matches/${matchId}`);
}

export async function getTodayMatches(): Promise<FootballApiMatch[]> {
  const today = new Date().toISOString().split("T")[0];
  const data = await fetchApi<{ matches: FootballApiMatch[] }>(
    `/competitions/${COMPETITION_ID}/matches?dateFrom=${today}&dateTo=${today}`
  );
  return data.matches;
}

export async function getLiveMatches(): Promise<FootballApiMatch[]> {
  const data = await fetchApi<{ matches: FootballApiMatch[] }>(
    `/competitions/${COMPETITION_ID}/matches?status=LIVE`
  );
  return data.matches;
}

export async function getStandings(): Promise<FootballApiStanding[]> {
  const data = await fetchApi<{ standings: FootballApiStanding[] }>(
    `/competitions/${COMPETITION_ID}/standings`
  );
  return data.standings;
}

export function mapApiStatus(
  apiStatus: string
): "SCHEDULED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED" {
  const map: Record<string, "SCHEDULED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "CANCELLED"> = {
    SCHEDULED: "SCHEDULED",
    TIMED: "SCHEDULED",
    IN_PLAY: "IN_PLAY",
    PAUSED: "PAUSED",
    FINISHED: "FINISHED",
    AWARDED: "FINISHED",
    POSTPONED: "POSTPONED",
    CANCELLED: "CANCELLED",
    SUSPENDED: "CANCELLED",
  };
  return map[apiStatus] ?? "SCHEDULED";
}

export function mapApiStage(apiStage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "GROUP_STAGE",
    LAST_32: "LAST_32",
    LAST_16: "LAST_16",
    ROUND_OF_16: "LAST_16",
    QUARTER_FINALS: "QUARTER_FINALS",
    SEMI_FINALS: "SEMI_FINALS",
    THIRD_PLACE: "THIRD_PLACE",
    FINAL: "FINAL",
  };
  return map[apiStage] ?? apiStage;
}

export const stageOrder: Record<string, number> = {
  GROUP_STAGE: 1,
  LAST_32: 2,
  LAST_16: 3,
  ROUND_OF_16: 3,
  QUARTER_FINALS: 4,
  SEMI_FINALS: 5,
  THIRD_PLACE: 6,
  FINAL: 7,
};
