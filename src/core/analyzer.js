import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';

/**
 * 统计分析核心模块 (纯UTC)
 */
export class Analyzer {
  static computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp = Date.now(), options = {}) {
    const modeOverride = options.modeOverride;
    const previousMode = options.previousMode || "fast";
    const hasFailure = !!options.hasFailure;

    let nextMatchStartTimestamp = Infinity;
    let lastMatchStartTimestamp = 0;
    let hasLiveMatch = false;

    for (const match of (rawMatches || [])) {
      const team1Score = parseInt(match.Team1Score) || 0;
      const team2Score = parseInt(match.Team2Score) || 0;
      const bestOf = parseInt(match.BestOf) || 3;
      const isFinished = Math.max(team1Score, team2Score) >= Math.ceil(bestOf / 2);
      const isLive = !isFinished && (team1Score > 0 || team2Score > 0 || (match.Team1Score !== "" && match.Team1Score != null));
      if (isLive) hasLiveMatch = true;

      const tsRaw = match.DateTime_UTC || match["DateTime UTC"];
      const timestamp = tsRaw ? new Date(tsRaw).getTime() : 0;
      if (!timestamp || Number.isNaN(timestamp)) continue;

      if (!isFinished && timestamp < nextMatchStartTimestamp) nextMatchStartTimestamp = timestamp;
      if (isFinished && timestamp > lastMatchStartTimestamp) lastMatchStartTimestamp = timestamp;
    }

    const startTimestamp = nextMatchStartTimestamp !== Infinity ? nextMatchStartTimestamp : 0;
    const matchIntervalHours = (lastMatchStartTimestamp > 0 && nextMatchStartTimestamp !== Infinity)
      ? (nextMatchStartTimestamp - lastMatchStartTimestamp) / (1000 * 60 * 60)
      : Infinity;
    const isMatchStarted = nextMatchStartTimestamp !== Infinity && nowTimestamp >= nextMatchStartTimestamp;
    const isNearInterval = matchIntervalHours < 8;
    const isModeOverride = modeOverride === "fast" || modeOverride === "slow";

    let nextMode;
    if (isModeOverride) nextMode = modeOverride;
    else if (hasFailure) nextMode = previousMode || "fast";
    else if (hasLiveMatch) nextMode = "fast";
    else if (isMatchStarted) nextMode = "fast";
    else if (isNearInterval) nextMode = "fast";
    else nextMode = "slow";

    let emoji = "";
    if (nextMode === "fast") {
      emoji = "🎮";
    } else {
      const timeToNextMatch = nextMatchStartTimestamp !== Infinity ? (nextMatchStartTimestamp - nowTimestamp) / (1000 * 60 * 60) : Infinity;
      emoji = timeToNextMatch <= 24 ? "⏳" : "🕊️";
    }

    const meta = {
      mode: nextMode,
      startTimestamp: startTimestamp,
      emoji,
      matchIntervalHours,
      hasStarted: isMatchStarted
    };
    if (isModeOverride) meta.modeOverride = modeOverride;
    return meta;
  }

  /**
   * 运行完整分析
   */
  static runFullAnalysis(allRawMatches, previousTournamentMeta, runtimeConfig, failedSlugs = new Set(), modeOverrides = {}, prevScheduleMap = {}, maxScheduleDays = 8) {
    const globalStats = {};
    const tournamentMeta = {};

    const timeGrid = { "ALL": {} };
    const createSlot = () => { 
      const slot = {}; 
      for(let slotIndex = 0; slotIndex < 8; slotIndex++) { 
        slot[slotIndex] = { totalMatchCount: 0, fullLengthMatchCount: 0, matches: [] }; 
      } 
      return slot; 
    };
    timeGrid.ALL = createSlot();

    const todayStr = dateUtils.getNow().dateString;
    const allFutureMatches = {};

    const buildResolveName = (teamMap = {}) => {
      const teamMapEntries = Object.entries(teamMap || {}).map(([key, value]) => ({ 
        key: key.toUpperCase(), 
        value 
      }));
      const nameCache = new Map();
      return (rawName) => {
        if (!rawName) return "Unknown";
        if (nameCache.has(rawName)) return nameCache.get(rawName);
        
        let resolvedName = rawName;
        const upperName = rawName.toUpperCase();
        
        if (upperName.includes("TBD") || upperName.includes("TBA") || upperName.includes("TO BE DETERMINED")) {
          resolvedName = "TBD";
        } else {
          let match = teamMapEntries.find(teamEntry => upperName === teamEntry.key);
          if (!match) match = teamMapEntries.find(teamEntry => upperName.includes(teamEntry.key));
          if (!match) {
            const inputTokens = upperName.split(/\s+/);
            match = teamMapEntries.find(teamEntry => {
              const keyTokens = teamEntry.key.split(/\s+/);
              return inputTokens.every(token => keyTokens.includes(token));
            });
          }
          if (match) resolvedName = match.value;
        }
        nameCache.set(rawName, resolvedName);
        return resolvedName;
      };
    };

    (runtimeConfig.TOURNAMENTS || []).forEach((tournament, tournamentIndex) => {
      const rawMatches = allRawMatches[tournament.slug] || [];
      const resolveName = buildResolveName(tournament.teamMap);
      const stats = {};
      const nowTimestamp = Date.now();

      const ensureTeam = (teamName) => { 
        if(!stats[teamName]) { 
          stats[teamName] = { 
            name: teamName, 
            bestOf3FullMatchCount: 0, bestOf3TotalMatchCount: 0, bestOf5FullMatchCount: 0, bestOf5TotalMatchCount: 0, 
            seriesWinCount: 0, seriesTotalMatchCount: 0, gameWinCount: 0, gameTotalCount: 0, 
            winStreakCount: 0, lossStreakCount: 0, last: 0, history: [] 
          }; 
        } 
      };

      rawMatches.forEach(match => {
        const team1Name = resolveName(match.Team1 || match["Team 1"]);
        const team2Name = resolveName(match.Team2 || match["Team 2"]);
        if(!team1Name || !team2Name) { return; }

        ensureTeam(team1Name); 
        ensureTeam(team2Name);

        const team1Score = parseInt(match.Team1Score) || 0;
        const team2Score = parseInt(match.Team2Score) || 0;
        const bestOf = parseInt(match.BestOf) || 3;
        const isFinished = Math.max(team1Score, team2Score) >= Math.ceil(bestOf / 2);
        const isLive = !isFinished && (team1Score > 0 || team2Score > 0 || (match.Team1Score !== "" && match.Team1Score != null));
        const isFullLength = (bestOf === 3 && Math.min(team1Score, team2Score) === 1) || (bestOf === 5 && Math.min(team1Score, team2Score) === 2);

        const dateTime = dateUtils.parseDate(match.DateTime_UTC || match["DateTime UTC"]);
        const utcTimeParts = dateTime ? dateUtils.getUtcTimeParts(dateTime) : null;
        let dateDisplay = "-", fullDate = "-", matchDateStr = "-", matchTimeStr = "-", timestamp = 0;
        let isoString = "";
        if (utcTimeParts) {
          matchTimeStr = `${utcTimeParts.hour}:${utcTimeParts.minute}`;
          dateDisplay = `${utcTimeParts.month}-${utcTimeParts.dayOfMonth} ${matchTimeStr}`;
          fullDate = `${utcTimeParts.year}-${utcTimeParts.month}-${utcTimeParts.dayOfMonth}`;
          matchDateStr = `${utcTimeParts.year}-${utcTimeParts.month}-${utcTimeParts.dayOfMonth}`;
          isoString = dateTime.toISOString();
          
          timestamp = (match.DateTime_UTC || match["DateTime UTC"]) ? new Date(match.DateTime_UTC || match["DateTime UTC"]).getTime() : 0;
        }

        if (matchDateStr >= todayStr || !isFinished) {
          const bucketDate = matchDateStr;
          if (!allFutureMatches[bucketDate]) allFutureMatches[bucketDate] = [];
          const tabName = match.Tab || "";
          allFutureMatches[bucketDate].push({
            time: matchTimeStr,
            team1Name: team1Name, 
            team2Name: team2Name, 
            team1Score: team1Score, 
            team2Score: team2Score, 
            bestOf: bestOf,
            isFinished: isFinished, 
            isLive: isLive,
            league: tournament.league, 
            slug: tournament.slug,
            tournamentIndex,
            tabName: tabName || "",
            isoTimestamp: isoString,
            timestamp: timestamp
          });
        }

        if (isFinished) {
          if(timestamp > stats[team1Name].last) stats[team1Name].last = timestamp;
          if(timestamp > stats[team2Name].last) stats[team2Name].last = timestamp;

          const pythonWeekdayIndex = utcTimeParts.dayOfWeek === 0 ? 6 : utcTimeParts.dayOfWeek - 1;
          const targetUtcHour = parseInt(utcTimeParts.hour, 10);

          const matchObj = { 
            dateDisplay: dateDisplay,
            fullDateDisplay: fullDate,
            isoTimestamp: isoString,
            timestamp: timestamp,
            team1Name: team1Name, 
            team2Name: team2Name, 
            scoreDisplay: `${team1Score}-${team2Score}`, 
            isFullLength: isFullLength, 
            bestOf: bestOf 
          };

          if (!timeGrid[tournament.slug]) timeGrid[tournament.slug] = { "Total": createSlot() };
          if (!timeGrid[tournament.slug][targetUtcHour]) timeGrid[tournament.slug][targetUtcHour] = createSlot();

          const addMatchToSlot = (grid, hour, dayIndex) => { 
            grid[hour][dayIndex].totalMatchCount++; 
            if(isFullLength) grid[hour][dayIndex].fullLengthMatchCount++; 
            grid[hour][dayIndex].matches.push(matchObj); 
          };
          addMatchToSlot(timeGrid[tournament.slug], targetUtcHour, pythonWeekdayIndex);
          addMatchToSlot(timeGrid[tournament.slug], "Total", pythonWeekdayIndex);
          addMatchToSlot(timeGrid[tournament.slug], targetUtcHour, 7);
          addMatchToSlot(timeGrid[tournament.slug], "Total", 7);
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
          dateDisplay: dateDisplay,
          fullDateDisplay: fullDate,
          isoTimestamp: isoString,
          opponentName: team2Name, 
          scoreDisplay: `${team1Score}-${team2Score}`, 
          matchResultCode: team1MatchResultCode, 
          bestOf: bestOf, 
          isFullLength: isFullLength, 
          timestamp: timestamp 
        });
        stats[team2Name].history.push({ 
          dateDisplay: dateDisplay,
          fullDateDisplay: fullDate,
          isoTimestamp: isoString,
          opponentName: team1Name, 
          scoreDisplay: `${team2Score}-${team1Score}`, 
          matchResultCode: team2MatchResultCode, 
          bestOf: bestOf, 
          isFullLength: isFullLength, 
          timestamp: timestamp 
        });

        if(!isFinished) { return; }
        
        const winner = team1Score > team2Score ? team1Name : team2Name;
        const loser = team1Score > team2Score ? team2Name : team1Name;
        
        [team1Name, team2Name].forEach(teamName => { 
          stats[teamName].seriesTotalMatchCount++; 
          stats[teamName].gameTotalCount += (team1Score + team2Score); 
        });
        
        stats[winner].seriesWinCount++; 
        stats[team1Name].gameWinCount += team1Score; 
        stats[team2Name].gameWinCount += team2Score;
        
        if(bestOf === 3) { 
          stats[team1Name].bestOf3TotalMatchCount++; 
          stats[team2Name].bestOf3TotalMatchCount++; 
          if(isFullLength) {
            stats[team1Name].bestOf3FullMatchCount++; 
            stats[team2Name].bestOf3FullMatchCount++;
          } 
        } else if(bestOf === 5) { 
          stats[team1Name].bestOf5TotalMatchCount++; 
          stats[team2Name].bestOf5TotalMatchCount++; 
          if(isFullLength) {
            stats[team1Name].bestOf5FullMatchCount++; 
            stats[team2Name].bestOf5FullMatchCount++;
          } 
        }

        if(stats[winner].lossStreakCount > 0) { 
          stats[winner].lossStreakCount = 0; 
          stats[winner].winStreakCount = 1; 
        } else { 
          stats[winner].winStreakCount++; 
        }
        
        if(stats[loser].winStreakCount > 0) { 
          stats[loser].winStreakCount = 0; 
          stats[loser].lossStreakCount = 1; 
        } else { 
          stats[loser].lossStreakCount++; 
        }
      });

      Object.values(stats).forEach(team => team.history.sort((leftHistory, rightHistory) => rightHistory.timestamp - leftHistory.timestamp));
      globalStats[tournament.slug] = stats;

      const modeOverride = modeOverrides[tournament.slug];
      const prevMeta = previousTournamentMeta[tournament.slug] || {};
      const meta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp, {
        modeOverride,
        previousMode: prevMeta.mode || "fast",
        hasFailure: failedSlugs.has(tournament.slug)
      });
      tournamentMeta[tournament.slug] = meta;
    });

    let scheduleMap = {};
    const sortedFutureDates = Object.keys(allFutureMatches).sort();
    sortedFutureDates.forEach(date => {
      scheduleMap[date] = allFutureMatches[date].sort((matchA, matchB) => {
        const matchATournamentIndex = matchA.tournamentIndex ?? 9999;
        const matchBTournamentIndex = matchB.tournamentIndex ?? 9999;
        if (matchATournamentIndex !== matchBTournamentIndex) return matchATournamentIndex - matchBTournamentIndex;
        return matchA.time.localeCompare(matchB.time);
      });
    });

    scheduleMap = dateUtils.pruneScheduleMapByDayStatus(scheduleMap, maxScheduleDays, todayStr);

    return {
      globalStats,
      timeGrid,
      scheduleMap,
      tournamentMeta
    };
  }

  /**
   * 计算队伍完整率统计
   */
  static calculateFullRateStats(sortedStats) {
    let bo3FullMatches = 0, bo3TotalMatches = 0, bo5FullMatches = 0, bo5TotalMatches = 0;
    sortedStats.forEach(stat => {
      bo3FullMatches += stat.bestOf3FullMatchCount || 0; 
      bo3TotalMatches += stat.bestOf3TotalMatchCount || 0;
      bo5FullMatches += stat.bestOf5FullMatchCount || 0; 
      bo5TotalMatches += stat.bestOf5TotalMatchCount || 0;
    });
    bo3FullMatches /= 2; 
    bo3TotalMatches /= 2; 
    bo5FullMatches /= 2; 
    bo5TotalMatches /= 2;
    
    return { bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches };
  }

  /**
   * 生成完整率字符串
   */
  static generateFullRateString(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches) {
    if (bo3TotalMatches === 0 && bo5TotalMatches === 0) return "";
    
    let parts = [];
    if (bo3TotalMatches > 0) {
      parts.push(`BO3: **${bo3FullMatches}/${bo3TotalMatches}** (${dataUtils.pct(dataUtils.rate(bo3FullMatches, bo3TotalMatches))})`);
    }
    if (bo5TotalMatches > 0) {
      parts.push(`BO5: **${bo5FullMatches}/${bo5TotalMatches}** (${dataUtils.pct(dataUtils.rate(bo5FullMatches, bo5TotalMatches))})`);
    }
    return parts.join(" | ");
  }
}
