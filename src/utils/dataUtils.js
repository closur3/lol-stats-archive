import { sortPolicy } from './sortPolicy.js';

/**
 * 数据处理工具函数
 */
export const dataUtils = {
  /**
   * 计算比率
   */
  rate: (numerator, denominator) => denominator > 0 ? numerator / denominator : null,

  /**
   * 格式化百分比
   */
  pct: (rate) => rate !== null ? `${Math.round(rate * 100)}%` : "-",

  /**
   * 根据比率生成颜色
   */
  color: (rate, reverse = false) => {
    if (rate === null) return "#f1f5f9";
    const normalizedRate = Math.max(0, Math.min(1, rate));
    const hue = reverse ? (1 - normalizedRate) * 140 : normalizedRate * 140;
    return `hsl(${parseInt(hue)}, 55%, 50%)`;
  },

  /**
   * 提取cookies
   */
  extractCookies: (headers) => {
    if (!headers) return "";
    if (typeof headers.getSetCookie === 'function') {
        const cookies = headers.getSetCookie();
        if (cookies && cookies.length > 0) {
          return cookies.map(cookie => cookie.split(';')[0].trim()).join('; ');
        }
      }
    const headerVal = headers.get("set-cookie");
    if (!headerVal) return "";
    return headerVal.split(/,(?=\s*[A-Za-z0-9_]+=[^;]+)/)
      .map(cookie => cookie.split(';')[0].trim())
      .filter(cookie => cookie.includes('='))
      .join('; ');
  },

  /**
   * 排序队伍统计
   */
  sortTeams: (statsObj) => {
    if (!statsObj) return [];
    const statsArray = Object.values(statsObj).filter(teamStats => teamStats && teamStats.name && teamStats.name !== "TBD");
    const priorMean = sortPolicy.getWeightedPriorMean(statsArray);

    return statsArray.sort((leftTeamStats, rightTeamStats) => {
      const { weightedFullMatchCount: leftWeightedFullMatchCount, weightedTotalMatchCount: leftWeightedTotalMatchCount } = sortPolicy.getTeamWeightedCounts(leftTeamStats);
      const { weightedFullMatchCount: rightWeightedFullMatchCount, weightedTotalMatchCount: rightWeightedTotalMatchCount } = sortPolicy.getTeamWeightedCounts(rightTeamStats);

      const leftFullRate = leftWeightedTotalMatchCount > 0 ? leftWeightedFullMatchCount / leftWeightedTotalMatchCount : 2.0;
      const rightFullRate = rightWeightedTotalMatchCount > 0 ? rightWeightedFullMatchCount / rightWeightedTotalMatchCount : 2.0;
      if (leftFullRate !== rightFullRate) return leftFullRate - rightFullRate;

      // 同打满率时使用贝叶斯收缩后验均值，避免固定阈值切分。
      const leftBayesRate = sortPolicy.bayesPosteriorRate(leftWeightedFullMatchCount, leftWeightedTotalMatchCount, priorMean, sortPolicy.BAYES_PRIOR_STRENGTH);
      const rightBayesRate = sortPolicy.bayesPosteriorRate(rightWeightedFullMatchCount, rightWeightedTotalMatchCount, priorMean, sortPolicy.BAYES_PRIOR_STRENGTH);
      if (leftBayesRate !== rightBayesRate) return leftBayesRate - rightBayesRate;

      // 后验相同再按样本量（升序优先大样本）
      if (leftWeightedTotalMatchCount !== rightWeightedTotalMatchCount) return rightWeightedTotalMatchCount - leftWeightedTotalMatchCount;

      const leftSeriesWinRate = dataUtils.rate(leftTeamStats.seriesWinCount, leftTeamStats.seriesTotalMatchCount) || 0;
      const rightSeriesWinRate = dataUtils.rate(rightTeamStats.seriesWinCount, rightTeamStats.seriesTotalMatchCount) || 0;
      if (leftSeriesWinRate !== rightSeriesWinRate) return rightSeriesWinRate - leftSeriesWinRate;

      const gameDiff = (dataUtils.rate(rightTeamStats.gameWinCount, rightTeamStats.gameTotalCount) || 0) - (dataUtils.rate(leftTeamStats.gameWinCount, leftTeamStats.gameTotalCount) || 0);
      if (gameDiff !== 0) return gameDiff;

      // 完全同档位时固定按队名升序，避免依赖对象插入顺序
      return String(leftTeamStats.name || "").localeCompare(String(rightTeamStats.name || ""));
    });
  },

  /**
   * 检查是否为扁平队伍映射
   */
  isFlatTeamMap: (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    return typeof obj[keys[0]] === "string";
  },

  /**
   * 为比赛过滤队伍映射
   */
  filterTeamMapForMatches: (baseMap, rawMatches = []) => {
    if (!baseMap || typeof baseMap !== "object") return {};
    const rawNames = new Set();
    rawMatches.forEach(match => {
      if (match.Team1) rawNames.add(match.Team1);
      if (match.Team2) rawNames.add(match.Team2);
    });
    if (rawNames.size === 0) return baseMap || {};

    const entries = Object.entries(baseMap).map(([entryKey, value]) => ({ entryKey, value, normalizedKey: String(entryKey).toUpperCase() }));
    const needed = {};

    const pickKeyForRaw = (rawUpper) => {
      let match = entries.find(entry => rawUpper === entry.normalizedKey);
      if (!match) match = entries.find(entry => rawUpper.includes(entry.normalizedKey));
      if (!match) {
        const inputTokens = rawUpper.split(/\s+/);
        match = entries.find(entry => {
          const keyTokens = entry.normalizedKey.split(/\s+/);
          return inputTokens.every(token => keyTokens.includes(token));
        });
      }
      return match ? match.entryKey : null;
    };

    rawNames.forEach(rawName => {
      const resolvedKey = pickKeyForRaw(String(rawName).toUpperCase());
      if (resolvedKey && baseMap[resolvedKey] != null) needed[resolvedKey] = baseMap[resolvedKey];
    });

    return needed;
  },

  /**
   * 选择队伍映射
   */
  pickTeamMap: (teamsRaw, tournament, rawMatches) => {
    if (!teamsRaw || typeof teamsRaw !== "object") return {};
    let base = {};
    if (teamsRaw.by_slug && teamsRaw.by_slug[tournament.slug]) base = teamsRaw.by_slug[tournament.slug];
    else if (teamsRaw.by_league && teamsRaw.by_league[tournament.league]) base = teamsRaw.by_league[tournament.league];
    else if (teamsRaw[tournament.slug] && typeof teamsRaw[tournament.slug] === "object") base = teamsRaw[tournament.slug];
    else if (teamsRaw[tournament.league] && typeof teamsRaw[tournament.league] === "object") base = teamsRaw[tournament.league];
    else if (dataUtils.isFlatTeamMap(teamsRaw)) base = teamsRaw;
    return dataUtils.filterTeamMapForMatches(base, rawMatches);
  },

  /**
   * 规范化 overview_page 为数组
   */
  normalizeOverviewPages: (overviewPage) => {
    return (Array.isArray(overviewPage) ? overviewPage : [overviewPage])
      .filter(page => typeof page === "string")
      .map(page => page.trim())
      .filter(Boolean);
  },

  /**
   * 转换为 Data: 前缀
   */
  toDataPage: (page) => page.startsWith("Data:") ? page : `Data:${page}`,

  /**
   * 解析 overview_page（支持逗号分隔、JSON 数组格式）
   */
  parseOverviewPages: (overviewPage) => {
    let pages = overviewPage;
    if (typeof pages === 'string') {
      const trimmed = pages.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          pages = JSON.parse(trimmed);
        } catch (_error) {
          pages = trimmed.split(',').map(page => page.trim()).filter(page => page.length > 0);
        }
      } else {
        pages = trimmed.split(',').map(page => page.trim()).filter(page => page.length > 0);
      }
    } else if (!Array.isArray(pages)) {
      pages = [pages];
    }
    return pages
      .map(page => typeof page === "string" ? page.trim() : "")
      .filter(Boolean);
  },

  /**
   * 获取第一个 overview_page
   */
  getFirstOverviewPage: (overviewPage) => {
    const pages = dataUtils.normalizeOverviewPages(overviewPage);
    return pages.length > 0 ? pages[0] : "";
  }

};
