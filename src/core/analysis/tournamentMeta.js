import { timePolicy } from '../../utils/timePolicy.js';
import { parseMatchBestOf, parseMatchScore } from './matchFields.js';

export function computeTournamentMetaFromRawMatches(rawMatches) {
  if (!Array.isArray(rawMatches)) throw new Error("rawMatches must be an array");
  const todayStr = timePolicy.getNow().dateString;
  let todayEarliest = 0;
  let todayUnfinished = 0;
  let hasHistoryUnfinished = false;

  for (const match of rawMatches) {
    const matchTime = timePolicy.deriveMatchTime(match.DateTimeUTC);
    const dateStr = matchTime.matchDateStr;
    const ts = matchTime.timestamp;

    if (dateStr === todayStr && ts && (!todayEarliest || ts < todayEarliest)) {
      todayEarliest = ts;
    }

    const team1Score = parseMatchScore(match.Team1Score, match.MatchId, "Team1Score");
    const team2Score = parseMatchScore(match.Team2Score, match.MatchId, "Team2Score");
    const bestOf = parseMatchBestOf(match.BestOf, match.MatchId, "BestOf");
    const isFinished = Math.max(team1Score, team2Score) >= Math.ceil(bestOf / 2);
    if (isFinished) continue;

    if (dateStr === todayStr) {
      todayUnfinished++;
    } else if (dateStr < todayStr) {
      hasHistoryUnfinished = true;
    }
  }

  return { todayEarliestTimestamp: todayEarliest, todayUnfinished, hasHistoryUnfinished };
}
