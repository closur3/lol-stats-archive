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
    const BO5_WEIGHT = 1.33;
    const statsArray = Object.values(statsObj).filter(teamStats => teamStats && teamStats.name && teamStats.name !== "TBD");

    return statsArray.sort((leftTeamStats, rightTeamStats) => {
      const leftWeightedFullMatchCount = (leftTeamStats.bestOf3FullMatchCount || 0) + ((leftTeamStats.bestOf5FullMatchCount || 0) * BO5_WEIGHT);
      const leftWeightedTotalMatchCount = (leftTeamStats.bestOf3TotalMatchCount || 0) + ((leftTeamStats.bestOf5TotalMatchCount || 0) * BO5_WEIGHT);
      const rightWeightedFullMatchCount = (rightTeamStats.bestOf3FullMatchCount || 0) + ((rightTeamStats.bestOf5FullMatchCount || 0) * BO5_WEIGHT);
      const rightWeightedTotalMatchCount = (rightTeamStats.bestOf3TotalMatchCount || 0) + ((rightTeamStats.bestOf5TotalMatchCount || 0) * BO5_WEIGHT);

      const leftFullRate = leftWeightedTotalMatchCount > 0 ? leftWeightedFullMatchCount / leftWeightedTotalMatchCount : 2.0;
      const rightFullRate = rightWeightedTotalMatchCount > 0 ? rightWeightedFullMatchCount / rightWeightedTotalMatchCount : 2.0;
      if (leftFullRate !== rightFullRate) return leftFullRate - rightFullRate;

      const leftRealTotalMatchCount = (leftTeamStats.bestOf3TotalMatchCount || 0) + (leftTeamStats.bestOf5TotalMatchCount || 0);
      const rightRealTotalMatchCount = (rightTeamStats.bestOf3TotalMatchCount || 0) + (rightTeamStats.bestOf5TotalMatchCount || 0);
      if (leftRealTotalMatchCount !== rightRealTotalMatchCount) return leftRealTotalMatchCount - rightRealTotalMatchCount;

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
      const team1 = match.Team1 || match["Team 1"];
      const team2 = match.Team2 || match["Team 2"];
      if (team1) rawNames.add(team1);
      if (team2) rawNames.add(team2);
    });
    if (rawNames.size === 0) return baseMap || {};

    const entries = Object.entries(baseMap).map(([key, value]) => ({ key, value, normalizedKey: String(key).toUpperCase() }));
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
      return match ? match.key : null;
    };

    rawNames.forEach(rawName => {
      const key = pickKeyForRaw(String(rawName).toUpperCase());
      if (key && baseMap[key] != null) needed[key] = baseMap[key];
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
  }

};
