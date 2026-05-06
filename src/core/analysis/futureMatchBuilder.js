import { dateUtils } from '../../utils/dateUtils.js';

export function buildScheduleMap(allFutureMatches, runtimeConfig, maxScheduleDays, tournamentMeta) {
  let scheduleMap = {};
  const sortedFutureDates = Object.keys(allFutureMatches).sort();
  sortedFutureDates.forEach(date => {
    scheduleMap[date] = allFutureMatches[date].sort((matchA, matchB) => {
      const matchATournamentIndex = matchA.tournamentIndex;
      const matchBTournamentIndex = matchB.tournamentIndex;
      if (matchATournamentIndex !== matchBTournamentIndex) return matchATournamentIndex - matchBTournamentIndex;
      return matchA.time.localeCompare(matchB.time);
    });
  });

  const historyUnfinished = {};
  for (const [slug, meta] of Object.entries(tournamentMeta)) {
    if (meta.hasHistoryUnfinished) historyUnfinished[slug] = true;
  }
  const todayStr = dateUtils.getNow().dateString;
  scheduleMap = dateUtils.pruneScheduleMapByDayStatus(scheduleMap, maxScheduleDays, todayStr, historyUnfinished);

  return scheduleMap;
}
