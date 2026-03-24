import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { MATCH_EXPIRY_HOURS, TABLE_COLUMNS, ICONS } from '../utils/constants.js';

/**
 * 统计分析核心模块
 */
export class Analyzer {
  /**
   * 运行完整分析
   */
  static runFullAnalysis(allRawMatches, previousTournamentMeta, runtimeConfig, failedSlugs = new Set()) {
    const globalStats = {};
    const tournamentMeta = {};

    const timeGrid = { "ALL": {} };
    const createSlot = () => { 
      const slot = {}; 
      for(let i = 0; i < 8; i++) { 
        slot[i] = { total: 0, full: 0, matches: [] }; 
      } 
      return slot; 
    };
    timeGrid.ALL = createSlot();

    const todayStr = dateUtils.getNow().date;
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
          let match = teamMapEntries.find(e => upperName === e.key);
          if (!match) match = teamMapEntries.find(e => upperName.includes(e.key));
          if (!match) {
            const inputTokens = upperName.split(/\s+/);
            match = teamMapEntries.find(e => {
              const keyTokens = e.key.split(/\s+/);
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
      console.log(`[ANALYSIS] ${tournament.slug}: rawMatches.length=${rawMatches.length}`);
      const resolveName = buildResolveName(tournament.team_map);
      const stats = {};
      let nextMatchStartTimestamp = Infinity;
      let lastMatchStartTimestamp = 0;
      const nowTimestamp = Date.now();
      let hasLiveMatch = false;

      const ensureTeam = (teamName) => { 
        if(!stats[teamName]) { 
          stats[teamName] = { 
            name: teamName, 
            bo3_f: 0, bo3_t: 0, bo5_f: 0, bo5_t: 0, 
            s_w: 0, s_t: 0, g_w: 0, g_t: 0, 
            strk_w: 0, strk_l: 0, last: 0, history: [] 
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
        if (isLive) hasLiveMatch = true;
        const isFull = (bestOf === 3 && Math.min(team1Score, team2Score) === 1) || (bestOf === 5 && Math.min(team1Score, team2Score) === 2);

        const dateTime = dateUtils.parseDate(match.DateTime_UTC || match["DateTime UTC"]);
        const timeParts = dateTime ? dateUtils.timeParts(dateTime) : null;
        let dateDisplay = "-", fullDate = "-", timestamp = 0;
        if (timeParts) {
          const matchTimeStr = `${timeParts.h}:${timeParts.m}`;
          dateDisplay = `${timeParts.mo}-${timeParts.da} ${matchTimeStr}`;
          fullDate = `${timeParts.y}-${timeParts.mo}-${timeParts.da}`;
          timestamp = match.DateTime_UTC ? new Date(match.DateTime_UTC).getTime() : 0;
        }

        // nextMatchStartTimestamp: 所有未结束比赛中最早的开始时间（包括即将开始的和正在进行的）
        if (!isFinished && timestamp < nextMatchStartTimestamp) {
          nextMatchStartTimestamp = timestamp;
        }

        // 跨天比赛强制保留逻辑
        const isCrossDayKeep = dateUtils.isCrossDayKeep(matchDateStr, todayStr, isFinished, isLive);

        if (matchDateStr >= todayStr || isCrossDayKeep) {
          const bucketDate = matchDateStr;
          if (!allFutureMatches[bucketDate]) allFutureMatches[bucketDate] = [];
          const tabName = match.Tab || "";
          allFutureMatches[bucketDate].push({
            time: matchTimeStr, 
            t1: team1Name, 
            t2: team2Name, 
            s1: team1Score, 
            s2: team2Score, 
            bo: bestOf,
            is_finished: isFinished, 
            is_live: isLive,
            league: tournament.league, 
            slug: tournament.slug,
            tournIndex: tournamentIndex, 
            tabName: tabName || ""
          });
        }

        if (isFinished) {
          if(timestamp > stats[team1Name].last) stats[team1Name].last = timestamp;
          if(timestamp > stats[team2Name].last) stats[team2Name].last = timestamp;

          const pyDay = timeParts.day === 0 ? 6 : timeParts.day - 1;
          const targetHour = parseInt(timeParts.h, 10);

          const matchObj = { 
            d: `${timeParts.mo}-${timeParts.da} ${matchTimeStr}`, 
            fd: `${timeParts.y}-${timeParts.mo}-${timeParts.da}`,
            t1: team1Name, 
            t2: team2Name, 
            s: `${team1Score}-${team2Score}`, 
            f: isFull, 
            bo: bestOf 
          };

          if (!timeGrid[tournament.slug]) timeGrid[tournament.slug] = { "Total": createSlot() };
          if (!timeGrid[tournament.slug][targetHour]) timeGrid[tournament.slug][targetHour] = createSlot();

          const addMatchToSlot = (grid, hour, day) => { 
            grid[hour][day].total++; 
            if(isFull) grid[hour][day].full++; 
            grid[hour][day].matches.push(matchObj); 
          };
          addMatchToSlot(timeGrid[tournament.slug], targetHour, pyDay);
          addMatchToSlot(timeGrid[tournament.slug], "Total", pyDay);
          addMatchToSlot(timeGrid[tournament.slug], targetHour, 7);
          addMatchToSlot(timeGrid[tournament.slug], "Total", 7);
        }

        let result1 = 'N', result2 = 'N';
        if (isLive) { 
          result1 = 'LIV'; 
          result2 = 'LIV'; 
        } else if (isFinished) {
          result1 = team1Score > team2Score ? 'W' : 'L';
          result2 = team2Score > team1Score ? 'W' : 'L';
        }

        stats[team1Name].history.push({ 
          d: dateDisplay, 
          fd: fullDate,
          vs: team2Name, 
          s: `${team1Score}-${team2Score}`, 
          res: result1, 
          bo: bestOf, 
          full: isFull, 
          ts: timestamp 
        });
        stats[team2Name].history.push({ 
          d: dateDisplay, 
          fd: fullDate,
          vs: team1Name, 
          s: `${team2Score}-${team1Score}`, 
          res: result2, 
          bo: bestOf, 
          full: isFull, 
          ts: timestamp 
        });

        if(!isFinished) { return; }
        
        const winner = team1Score > team2Score ? team1Name : team2Name;
        const loser = team1Score > team2Score ? team2Name : team1Name;
        
        [team1Name, team2Name].forEach(teamName => { 
          stats[teamName].s_t++; 
          stats[teamName].g_t += (team1Score + team2Score); 
        });
        
        stats[winner].s_w++; 
        stats[team1Name].g_w += team1Score; 
        stats[team2Name].g_w += team2Score;
        
        if(bestOf === 3) { 
          stats[team1Name].bo3_t++; 
          stats[team2Name].bo3_t++; 
          if(isFull) {
            stats[team1Name].bo3_f++; 
            stats[team2Name].bo3_f++;
          } 
        } else if(bestOf === 5) { 
          stats[team1Name].bo5_t++; 
          stats[team2Name].bo5_t++; 
          if(isFull) {
            stats[team1Name].bo5_f++; 
            stats[team2Name].bo5_f++;
          } 
        }

        if(stats[winner].strk_l > 0) { 
          stats[winner].strk_l = 0; 
          stats[winner].strk_w = 1; 
        } else { 
          stats[winner].strk_w++; 
        }
        
        if(stats[loser].strk_w > 0) { 
          stats[loser].strk_w = 0; 
          stats[loser].strk_l = 1; 
        } else { 
          stats[loser].strk_l++; 
        }
      });

      Object.values(stats).forEach(team => team.history.sort((a, b) => b.ts - a.ts));
      globalStats[tournament.slug] = stats;

      const startTimestamp = nextMatchStartTimestamp !== Infinity ? nextMatchStartTimestamp : 0;

      const matchIntervalHours = (lastMatchStartTimestamp > 0 && nextMatchStartTimestamp !== Infinity)
        ? (nextMatchStartTimestamp - lastMatchStartTimestamp) / (1000 * 60 * 60)
        : Infinity;

      const isMatchStarted = nextMatchStartTimestamp !== Infinity && nowTimestamp >= nextMatchStartTimestamp;
      const isNearInterval = matchIntervalHours < 8;

      let nextMode;
      if (failedSlugs.has(tournament.slug)) {
        nextMode = previousTournamentMeta.mode || "fast";
      } else if (hasLiveMatch) {
        nextMode = "fast";
      } else if (isMatchStarted) {
        nextMode = "fast";
      } else if (isNearInterval) {
        nextMode = "fast";
      } else {
        nextMode = "slow";
      }

      let emoji = "";
      if (nextMode === "fast") {
        emoji = "🎮";
      } else {
        const timeToNextMatch = nextMatchStartTimestamp !== Infinity ? (nextMatchStartTimestamp - nowTimestamp) / (1000 * 60 * 60) : Infinity;
        if (timeToNextMatch <= 24) {
          emoji = "⏳";
        } else {
          emoji = "💤";
        }
      }

      tournamentMeta[tournament.slug] = { 
        mode: nextMode, 
        startTs: startTimestamp, 
        emoji, 
        matchIntervalHours, 
        isStarted: isMatchStarted 
      };
    });

    let scheduleMap = {};
    const sortedFutureDates = Object.keys(allFutureMatches).sort();
        sortedFutureDates.slice(0, 4).forEach(date => {
      scheduleMap[date] = allFutureMatches[date].sort((matchA, matchB) => {
        if (matchA.tournIndex !== matchB.tournIndex) return matchA.tournIndex - matchB.tournIndex;
        return matchA.time.localeCompare(matchB.time);
      });
    });

    return { globalStats, timeGrid, scheduleMap, tournMeta: tournamentMeta };
  }

  /**
   * 计算队伍完整率统计
   */
  static calculateFullRateStats(sortedStats) {
    let bo3FullMatches = 0, bo3TotalMatches = 0, bo5FullMatches = 0, bo5TotalMatches = 0;
    sortedStats.forEach(stat => {
      bo3FullMatches += stat.bo3_f || 0; 
      bo3TotalMatches += stat.bo3_t || 0;
      bo5FullMatches += stat.bo5_f || 0; 
      bo5TotalMatches += stat.bo5_t || 0;
    });
    // 比赛双向记录，总数需除以 2
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