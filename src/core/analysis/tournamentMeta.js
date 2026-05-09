import { dateUtils } from '../../utils/dateUtils.js';

export function computeTournamentMetaFromRawMatches(rawMatches) {
  const todayStr = dateUtils.getNow().dateString;
  let todayEarliest = 0;
  let todayUnfinished = 0;
  let hasHistoryUnfinished = false;

  for (const match of (rawMatches || [])) {
    let dt;
    try {
      dt = dateUtils.parseDate(match.DateTimeUTC);
    } catch (error) {
      console.error(`[tournamentMeta] Failed to parse date "${match.DateTimeUTC}": ${error.message}`);
      continue;
    }
    const parts = dt ? dateUtils.getUtcTimeParts(dt) : null;
    if (!parts) continue;
    const dateStr = `${parts.year}-${parts.month}-${parts.dayOfMonth}`;
    const ts = dt.getTime();

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
