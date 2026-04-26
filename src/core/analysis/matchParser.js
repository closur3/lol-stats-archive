import { dateUtils } from '../../utils/dateUtils.js';

export function parseAllMatches(rawMatches, resolveName, todayStr, tournamentSlug, tournamentLeague, tournamentIndex, allFutureMatches) {
  const parsedMatches = [];
  const allStatsInit = {
    bestOf3FullMatchCount: 0, bestOf3TotalMatchCount: 0,
    bestOf5FullMatchCount: 0, bestOf5TotalMatchCount: 0,
    seriesWinCount: 0, seriesTotalMatchCount: 0,
    gameWinCount: 0, gameTotalCount: 0,
    winStreakCount: 0, lossStreakCount: 0,
    last: 0, history: []
  };

  const stats = {};

  const ensureTeam = (teamName) => {
    if (!stats[teamName]) {
      stats[teamName] = { name: teamName, ...JSON.parse(JSON.stringify(allStatsInit)) };
    }
  };

  rawMatches.forEach(match => {
    const team1Name = resolveName(match.Team1);
    const team2Name = resolveName(match.Team2);
    if (!team1Name || !team2Name) { return; }

    ensureTeam(team1Name);
    ensureTeam(team2Name);

    const team1Score = parseInt(match.Team1Score) || 0;
    const team2Score = parseInt(match.Team2Score) || 0;
    const bestOf = parseInt(match.BestOf) || 3;
    const isFinished = Math.max(team1Score, team2Score) >= Math.ceil(bestOf / 2);
    const isLive = !isFinished && (team1Score > 0 || team2Score > 0 || (match.Team1Score !== "" && match.Team1Score != null));
    const isFullLength = (bestOf === 3 && Math.min(team1Score, team2Score) === 1) || (bestOf === 5 && Math.min(team1Score, team2Score) === 2);

    let dateTime;
    try {
      dateTime = dateUtils.parseDate(match.DateTimeUTC);
    } catch {
      return;
    }
    const utcTimeParts = dateTime ? dateUtils.getUtcTimeParts(dateTime) : null;
    let dateDisplay = "-", fullDate = "-", matchDateStr = "-", matchTimeStr = "-", timestamp = 0;
    let isoString = "";
    if (utcTimeParts) {
      matchTimeStr = `${utcTimeParts.hour}:${utcTimeParts.minute}`;
      dateDisplay = `${utcTimeParts.month}-${utcTimeParts.dayOfMonth} ${matchTimeStr}`;
      fullDate = `${utcTimeParts.year}-${utcTimeParts.month}-${utcTimeParts.dayOfMonth}`;
      matchDateStr = `${utcTimeParts.year}-${utcTimeParts.month}-${utcTimeParts.dayOfMonth}`;
      isoString = dateTime.toISOString();
      timestamp = dateTime.getTime();
    }

    if (matchDateStr !== "-" && (matchDateStr >= todayStr || !isFinished)) {
      if (!allFutureMatches[matchDateStr]) allFutureMatches[matchDateStr] = [];
      const tabName = match.Tab || "";
      allFutureMatches[matchDateStr].push({
        time: matchTimeStr,
        team1Name, team2Name,
        team1Score, team2Score,
        bestOf,
        isFinished, isLive,
        league: tournamentLeague,
        slug: tournamentSlug,
        tournamentIndex,
        tabName: tabName || "",
        isoTimestamp: isoString,
        timestamp
      });
    }

    if (isFinished) {
      if (timestamp > stats[team1Name].last) stats[team1Name].last = timestamp;
      if (timestamp > stats[team2Name].last) stats[team2Name].last = timestamp;

      const weekdayIndex = utcTimeParts.dayOfWeek === 0 ? 6 : utcTimeParts.dayOfWeek - 1;
      const utcHour = parseInt(utcTimeParts.hour, 10);
      const utcMinute = parseInt(utcTimeParts.minute, 10);
      const timeMinutes = utcHour * 60 + utcMinute;
      const roundedMinutes = Math.round(timeMinutes / 60) * 60;

      parsedMatches.push({
        team1Name, team2Name, team1Score, team2Score, bestOf, isFullLength,
        dateDisplay, fullDateDisplay: fullDate, isoTimestamp: isoString,
        timestamp, weekdayIndex, timeMinutes, roundedMinutes, matchDateStr
      });
    }

    let team1MatchResultCode = 'NEXT', team2MatchResultCode = 'NEXT';
    if (isLive) {
      team1MatchResultCode = 'LIVE';
      team2MatchResultCode = 'LIVE';
    } else if (isFinished) {
      team1MatchResultCode = team1Score > team2Score ? 'WIN' : 'LOSS';
      team2MatchResultCode = team2Score > team1Score ? 'WIN' : 'LOSS';
    }

    stats[team1Name].history.push({
      dateDisplay, fullDateDisplay: fullDate, isoTimestamp: isoString,
      opponentName: team2Name,
      scoreDisplay: `${team1Score}-${team2Score}`,
      matchResultCode: team1MatchResultCode,
      bestOf, isFullLength, timestamp
    });
    stats[team2Name].history.push({
      dateDisplay, fullDateDisplay: fullDate, isoTimestamp: isoString,
      opponentName: team1Name,
      scoreDisplay: `${team2Score}-${team1Score}`,
      matchResultCode: team2MatchResultCode,
      bestOf, isFullLength, timestamp
    });

    if (!isFinished) { return; }

    const winner = team1Score > team2Score ? team1Name : team2Name;
    const loser = team1Score > team2Score ? team2Name : team1Name;

    [team1Name, team2Name].forEach(teamName => {
      stats[teamName].seriesTotalMatchCount++;
      stats[teamName].gameTotalCount += (team1Score + team2Score);
    });

    stats[winner].seriesWinCount++;
    stats[team1Name].gameWinCount += team1Score;
    stats[team2Name].gameWinCount += team2Score;

    if (bestOf === 3) {
      stats[team1Name].bestOf3TotalMatchCount++;
      stats[team2Name].bestOf3TotalMatchCount++;
      if (isFullLength) {
        stats[team1Name].bestOf3FullMatchCount++;
        stats[team2Name].bestOf3FullMatchCount++;
      }
    } else if (bestOf === 5) {
      stats[team1Name].bestOf5TotalMatchCount++;
      stats[team2Name].bestOf5TotalMatchCount++;
      if (isFullLength) {
        stats[team1Name].bestOf5FullMatchCount++;
        stats[team2Name].bestOf5FullMatchCount++;
      }
    }

    if (stats[winner].lossStreakCount > 0) {
      stats[winner].lossStreakCount = 0;
      stats[winner].winStreakCount = 1;
    } else {
      stats[winner].winStreakCount++;
    }

    if (stats[loser].winStreakCount > 0) {
      stats[loser].winStreakCount = 0;
      stats[loser].lossStreakCount = 1;
    } else {
      stats[loser].lossStreakCount++;
    }
  });

  Object.values(stats).forEach(team => team.history.sort((leftHistory, rightHistory) => rightHistory.timestamp - leftHistory.timestamp));

  return { stats, parsedMatches };
}