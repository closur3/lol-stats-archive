import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { TIME_GRID_COLUMN_COUNT, DEFAULT_MAX_SCHEDULE_DAYS } from '../utils/constants.js';

// 分析配置常量
const ANALYZER_CONFIG = {
  MATCH_INTERVAL_HOURS_THRESHOLD: 8,  // 比赛间隔阈值（小时），超过则切换 slow 模式
};

/**
 * 统计分析核心模块 (纯UTC)
 */
export class Analyzer {
  static computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp = Date.now(), options = {}) {
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

      // 统一访问时间戳字段（兼容两种命名风格）
      const tsRaw = match.DateTime_UTC ?? match["DateTime UTC"];
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
    const isNearInterval = matchIntervalHours < ANALYZER_CONFIG.MATCH_INTERVAL_HOURS_THRESHOLD;

    let nextMode;
    if (hasFailure) nextMode = previousMode || "fast";
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
    return meta;
  }

  /**
   * 运行完整分析
   */
  static runFullAnalysis(allRawMatches, previousTournamentMeta, runtimeConfig, failedSlugs = new Set(), maxScheduleDays = DEFAULT_MAX_SCHEDULE_DAYS) {
    const globalStats = {};
    const tournamentMeta = {};

    const timeGrid = { "ALL": {} };
    const createSlot = () => {
      const slot = {};
      for (let dayIndex = 0; dayIndex < TIME_GRID_COLUMN_COUNT; dayIndex++) {
        slot[dayIndex] = { totalMatchCount: 0, fullLengthMatchCount: 0, matches: [] };
      }
      return slot;
    };
    timeGrid.ALL = createSlot();

    const todayStr = dateUtils.getNow().dateString;
    const allFutureMatches = {};

    const buildResolveName = (teamMap = {}) => {
      const teamMapEntries = Object.entries(teamMap || {}).map(([key, value]) => {
        const upperKey = String(key || "").toUpperCase();
        return {
          key: upperKey,
          value,
          keyTokens: upperKey.split(/\s+/).filter(Boolean)
        };
      });
      const exactTeamMap = new Map(teamMapEntries.map(teamEntry => [teamEntry.key, teamEntry.value]));
      const nameCache = new Map();
      return (rawName) => {
        if (!rawName) return "Unknown";
        if (nameCache.has(rawName)) return nameCache.get(rawName);
        
        let resolvedName = rawName;
        const upperName = rawName.toUpperCase();
        
        if (upperName.includes("TBD") || upperName.includes("TBA") || upperName.includes("TO BE DETERMINED")) {
          resolvedName = "TBD";
        } else {
          const exactName = exactTeamMap.get(upperName);
          let match = exactName ? { value: exactName } : null;
          if (!match) match = teamMapEntries.find(teamEntry => upperName.includes(teamEntry.key));
          if (!match) {
            const inputTokens = upperName.split(/\s+/);
            match = teamMapEntries.find(teamEntry => {
              return inputTokens.every(token => teamEntry.keyTokens.includes(token));
            });
          }
          if (match) resolvedName = match.value;
        }
        nameCache.set(rawName, resolvedName);
        return resolvedName;
      };
    };

    const clusterTimeSlots = (finishedMatches, maxClusters) => {
      const timeSet = new Set();
      for (const m of finishedMatches) {
        timeSet.add(m.roundedMinutes);
      }
      const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);

      if (sortedTimes.length <= maxClusters) {
        return sortedTimes.map(t => {
          return {
            actualCenter: t,
            centerMinutes: t,
            modeMinutes: t,
            label: String(Math.floor(t / 60)),
            matches: []
          };
        });
      }

      const THRESHOLD = 60;
      const clusters = [];
      let currentCluster = { centerMinutes: sortedTimes[0], times: [sortedTimes[0]] };

      for (let i = 1; i < sortedTimes.length; i++) {
        const time = sortedTimes[i];
        const dist = Math.abs(time - currentCluster.centerMinutes);
        if (dist <= THRESHOLD && clusters.length + 1 < maxClusters) {
          currentCluster.times.push(time);
          currentCluster.centerMinutes = Math.round(currentCluster.times.reduce((a, b) => a + b, 0) / currentCluster.times.length);
        } else {
          clusters.push(currentCluster);
          currentCluster = { centerMinutes: time, times: [time] };
        }
      }
      clusters.push(currentCluster);

      while (clusters.length > maxClusters) {
        let minDist = Infinity, mergeIdx = 0;
        for (let i = 0; i < clusters.length - 1; i++) {
          const dist = clusters[i + 1].centerMinutes - clusters[i].centerMinutes;
          if (dist < minDist) { minDist = dist; mergeIdx = i; }
        }
        const merged = {
          centerMinutes: Math.round((clusters[mergeIdx].centerMinutes + clusters[mergeIdx + 1].centerMinutes) / 2),
          times: [...clusters[mergeIdx].times, ...clusters[mergeIdx + 1].times]
        };
        clusters.splice(mergeIdx, 2, merged);
      }

      return clusters.map(c => {
        const utcHour = Math.round(c.centerMinutes / 60) % 24;
        return {
          actualCenter: c.centerMinutes,
          centerMinutes: utcHour * 60,
          modeMinutes: null,
          label: String(utcHour),
          matches: []
        };
      });
    };

    const assignMatchesToClusters = (finishedMatches, clusters) => {
      for (const m of finishedMatches) {
        let bestCluster = 0, bestDist = Infinity;
        for (let i = 0; i < clusters.length; i++) {
          const dist = Math.abs(m.timeMinutes - clusters[i].actualCenter);
          if (dist < bestDist) { bestDist = dist; bestCluster = i; }
        }
        clusters[bestCluster].matches.push(m);
      }

      for (const c of clusters) {
        if (c.matches.length === 0) continue;
        const countMap = {};
        for (const m of c.matches) {
          countMap[m.roundedMinutes] = (countMap[m.roundedMinutes] || 0) + 1;
        }
        let modeMinutes = c.matches[0].roundedMinutes, maxCount = 0;
        for (const [mins, cnt] of Object.entries(countMap)) {
          if (cnt > maxCount) { maxCount = cnt; modeMinutes = parseInt(mins); }
        }
        c.modeMinutes = modeMinutes;
        c.label = String(Math.floor(modeMinutes / 60));
      }
    };

    (runtimeConfig.TOURNAMENTS || []).forEach((tournament, tournamentIndex) => {
      const rawMatches = allRawMatches[tournament.slug] || [];
      // 注意：rawMatches可能包含不一致的字段命名（如"Team 1" vs "Team1"）
      // 这是由Fandom API返回的数据格式决定的，已在数据入口处处理
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

      const parsedMatches = [];

      rawMatches.forEach(match => {
        // 统一访问方式：优先使用无空格版本，兼容两种命名风格
        const team1Name = resolveName(match.Team1 ?? match["Team 1"]);
        const team2Name = resolveName(match.Team2 ?? match["Team 2"]);
        if(!team1Name || !team2Name) { return; }

        ensureTeam(team1Name); 
        ensureTeam(team2Name);

        // 统一访问比分和最佳局数字段
        const team1Score = parseInt(match.Team1Score ?? match["Team 1 Score"]) || 0;
        const team2Score = parseInt(match.Team2Score ?? match["Team 2 Score"]) || 0;
        const bestOf = parseInt(match.BestOf ?? match["Best Of"]) || 3;
        const isFinished = Math.max(team1Score, team2Score) >= Math.ceil(bestOf / 2);
        const isLive = !isFinished && (team1Score > 0 || team2Score > 0 || (match.Team1Score !== "" && match.Team1Score != null));
        const isFullLength = (bestOf === 3 && Math.min(team1Score, team2Score) === 1) || (bestOf === 5 && Math.min(team1Score, team2Score) === 2);

        // 统一访问时间戳字段（兼容两种命名风格）
        const dateTime = dateUtils.parseDate(match.DateTime_UTC ?? match["DateTime UTC"]);
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
          const utcHour = parseInt(utcTimeParts.hour, 10);
          const utcMinute = parseInt(utcTimeParts.minute, 10);
          const timeMinutes = utcHour * 60 + utcMinute;
          const roundedMinutes = Math.round(timeMinutes / 60) * 60;

          parsedMatches.push({
            team1Name, team2Name, team1Score, team2Score, bestOf, isFullLength,
            dateDisplay, fullDateDisplay: fullDate, isoTimestamp: isoString,
            timestamp, pythonWeekdayIndex, timeMinutes, roundedMinutes, matchDateStr
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

      const dayCounts = {};
      for (const m of parsedMatches) {
        dayCounts[m.matchDateStr] = (dayCounts[m.matchDateStr] || 0) + 1;
      }
      const maxMatchesPerDay = Math.max(...Object.values(dayCounts), 1);
      const clusters = clusterTimeSlots(parsedMatches, maxMatchesPerDay);
      assignMatchesToClusters(parsedMatches, clusters);

      // 同一日期内，按时间顺序将比赛分配到不同时间槽，避免“同一天两场进同一槽”被隐藏
      const assignedClusterByMatch = new Map();
      const matchesByDate = {};
      for (const match of parsedMatches) {
        if (!matchesByDate[match.matchDateStr]) matchesByDate[match.matchDateStr] = [];
        matchesByDate[match.matchDateStr].push(match);
      }
      for (const dailyMatches of Object.values(matchesByDate)) {
        const sortedDailyMatches = [...dailyMatches].sort((leftMatch, rightMatch) => {
          if (leftMatch.timeMinutes !== rightMatch.timeMinutes) return leftMatch.timeMinutes - rightMatch.timeMinutes;
          return (leftMatch.timestamp || 0) - (rightMatch.timestamp || 0);
        });
        const usedClusterIndexes = new Set();
        for (const match of sortedDailyMatches) {
          let chosenClusterIndex = -1;
          let chosenDist = Infinity;
          let chosenCenter = Infinity;

          for (let clusterIndex = 0; clusterIndex < clusters.length; clusterIndex++) {
            if (usedClusterIndexes.has(clusterIndex)) continue;
            const cluster = clusters[clusterIndex];
            const dist = Math.abs(match.timeMinutes - cluster.actualCenter);
            const center = cluster.actualCenter;
            if (dist < chosenDist || (dist === chosenDist && center < chosenCenter)) {
              chosenDist = dist;
              chosenCenter = center;
              chosenClusterIndex = clusterIndex;
            }
          }

          if (chosenClusterIndex < 0) {
            throw new Error(`No available time slot for ${tournament.slug} on ${match.matchDateStr}. dailyMatches=${sortedDailyMatches.length}, clusters=${clusters.length}`);
          }
          usedClusterIndexes.add(chosenClusterIndex);
          assignedClusterByMatch.set(match, chosenClusterIndex);
        }
      }

      if (!timeGrid[tournament.slug]) timeGrid[tournament.slug] = { "Total": createSlot() };

      for (const cluster of clusters) {
        if (!timeGrid[tournament.slug][cluster.label]) {
          timeGrid[tournament.slug][cluster.label] = createSlot();
        }
      }

      for (const m of parsedMatches) {
        const matchObj = { 
          dateDisplay: m.dateDisplay,
          fullDateDisplay: m.fullDateDisplay,
          isoTimestamp: m.isoTimestamp,
          timestamp: m.timestamp,
          team1Name: m.team1Name, 
          team2Name: m.team2Name, 
          scoreDisplay: `${m.team1Score}-${m.team2Score}`, 
          isFullLength: m.isFullLength, 
          bestOf: m.bestOf 
        };

        let bestCluster = null;
        const assignedClusterIndex = assignedClusterByMatch.get(m);
        if (assignedClusterIndex != null && clusters[assignedClusterIndex]) {
          bestCluster = clusters[assignedClusterIndex];
        } else {
          let bestDist = Infinity;
          for (const c of clusters) {
            const dist = Math.abs(m.timeMinutes - c.actualCenter);
            if (dist < bestDist) { bestDist = dist; bestCluster = c; }
          }
        }
        if (!bestCluster) continue;

        const dayIndex = m.pythonWeekdayIndex;
        const addMatchToSlot = (grid, label, dayIndex) => {
          grid[label][dayIndex].totalMatchCount++;
          if (m.isFullLength) grid[label][dayIndex].fullLengthMatchCount++;
          grid[label][dayIndex].matches.push(matchObj);
        };
        addMatchToSlot(timeGrid[tournament.slug], bestCluster.label, dayIndex);
        addMatchToSlot(timeGrid[tournament.slug], "Total", dayIndex);
        addMatchToSlot(timeGrid[tournament.slug], bestCluster.label, 7);
        addMatchToSlot(timeGrid[tournament.slug], "Total", 7);
      }

      const prevMeta = previousTournamentMeta[tournament.slug] || {};
      const meta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp, {
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
