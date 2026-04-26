import { TIME_GRID_COLUMN_COUNT, DEFAULT_MAX_SCHEDULE_DAYS } from '../constants/index.js';
import { dateUtils } from '../utils/dateUtils.js';
import { computeTournamentMetaFromRawMatches } from './analysis/tournamentMeta.js';
import { calculateFullRateStats, generateFullRateString } from './analysis/fullRateStats.js';
import { buildResolveName } from './analysis/teamResolver.js';
import { parseAllMatches } from './analysis/matchParser.js';
import { buildTimeGridAndSchedule } from './analysis/gridBuilder.js';
import { buildScheduleMap } from './analysis/futureMatchBuilder.js';

/**
 * 统计分析核心模块 (纯UTC)
 */
export class Analyzer {
  static computeTournamentMetaFromRawMatches = computeTournamentMetaFromRawMatches;

  /**
   * 运行完整分析
   */
  static runFullAnalysis(allRawMatches, runtimeConfig, maxScheduleDays = DEFAULT_MAX_SCHEDULE_DAYS) {
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

    (runtimeConfig.TOURNAMENTS || []).forEach((tournament, tournamentIndex) => {
      const rawMatches = allRawMatches[tournament.slug] || [];

      const resolveName = buildResolveName(tournament.teamMap);
      const { stats, parsedMatches } = parseAllMatches(rawMatches, resolveName, todayStr, tournament.slug, tournament.league, tournamentIndex, allFutureMatches);

      globalStats[tournament.slug] = stats;

      buildTimeGridAndSchedule(tournament.slug, parsedMatches, timeGrid);

      const meta = computeTournamentMetaFromRawMatches(rawMatches);
      tournamentMeta[tournament.slug] = meta;
    });

    const scheduleMap = buildScheduleMap(allFutureMatches, runtimeConfig, maxScheduleDays, tournamentMeta);

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
  static calculateFullRateStats = calculateFullRateStats;

  /**
   * 生成完整率字符串
   */
  static generateFullRateString = generateFullRateString;
}