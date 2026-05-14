import { timePolicy } from '../../utils/timePolicy.js';

export function computeTournamentMetaFromRawMatches(rawMatches) {
  if (!Array.isArray(rawMatches)) throw new Error("rawMatches must be an array");
  const todayStr = timePolicy.getNow().dateString;
  let todayEarliest = 0;
  let todayUnfinished = 0;
  let hasHistoryUnfinished = false;

  for (const match of rawMatches) {
    let matchTime;
    try {
      matchTime = timePolicy.deriveMatchTime(match.DateTimeUTC);
    } catch (error) {
      console.error(`[ANALYZE:META] invalid DateTimeUTC=${match.DateTimeUTC} error=${error.message}`);
      continue;
    }
    const dateStr = matchTime.matchDateStr;
    const ts = matchTime.timestamp;

    if (dateStr === todayStr && ts && (!todayEarliest || ts < todayEarliest)) {
      todayEarliest = ts;
    }

    const team1Score = parseInt(match.Team1Score) || 0;
    const team2Score = parseInt(match.Team2Score) || 0;
    const bestOf = parseInt(match.BestOf);
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
