/**
 * 数据处理工具函数
 */
export const dataUtils = {
  /**
   * 计算比率
   */
  rate: (n, d) => d > 0 ? n / d : null,

  /**
   * 格式化百分比
   */
  pct: (r) => r !== null ? `${Math.round(r * 100)}%` : "-",

  /**
   * 根据比率生成颜色
   */
  color: (r, rev = false) => {
    if (r === null) return "#f1f5f9";
    const val = Math.max(0, Math.min(1, r));
    const hue = rev ? (1 - val) * 140 : val * 140;
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
        return cookies.map(c => c.split(';')[0].trim()).join('; ');
      }
    }
    const headerVal = headers.get("set-cookie");
    if (!headerVal) return "";
    return headerVal.split(/,(?=\s*[A-Za-z0-9_]+=[^;]+)/)
      .map(c => c.split(';')[0].trim())
      .filter(c => c.includes('='))
      .join('; ');
  },

  /**
   * 排序队伍统计
   */
  sortTeams: (statsObj) => {
    if (!statsObj) return [];
    const BO5_WEIGHT = 1.33;
    const statsArray = Object.values(statsObj).filter(s => s && s.name && s.name !== "TBD");

    return statsArray.sort((a, b) => {
      const aFulls_W = (a.bo3_f || 0) + ((a.bo5_f || 0) * BO5_WEIGHT);
      const aTotal_W = (a.bo3_t || 0) + ((a.bo5_t || 0) * BO5_WEIGHT);
      const bFulls_W = (b.bo3_f || 0) + ((b.bo5_f || 0) * BO5_WEIGHT);
      const bTotal_W = (b.bo3_t || 0) + ((b.bo5_t || 0) * BO5_WEIGHT);

      const aFullRate = aTotal_W > 0 ? aFulls_W / aTotal_W : 2.0;
      const bFullRate = bTotal_W > 0 ? bFulls_W / bTotal_W : 2.0;
      if (aFullRate !== bFullRate) return aFullRate - bFullRate;

      const aRealTotal = (a.bo3_t || 0) + (a.bo5_t || 0);
      const bRealTotal = (b.bo3_t || 0) + (b.bo5_t || 0);
      if (aRealTotal !== bRealTotal) return aRealTotal - bRealTotal;

      const aWR = dataUtils.rate(a.s_w, a.s_t) || 0;
      const bWR = dataUtils.rate(b.s_w, b.s_t) || 0;
      if (aWR !== bWR) return bWR - aWR;

      const gameDiff = (dataUtils.rate(b.g_w, b.g_t) || 0) - (dataUtils.rate(a.g_w, a.g_t) || 0);
      if (gameDiff !== 0) return gameDiff;

      // 完全同档位时固定按队名升序，避免依赖对象插入顺序
      return String(a.name || "").localeCompare(String(b.name || ""));
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

    const entries = Object.entries(baseMap).map(([k, v]) => ({ k, v, ku: String(k).toUpperCase() }));
    const needed = {};

    const pickKeyForRaw = (rawUpper) => {
      let match = entries.find(e => rawUpper === e.ku);
      if (!match) match = entries.find(e => rawUpper.includes(e.ku));
      if (!match) {
        const inputTokens = rawUpper.split(/\s+/);
        match = entries.find(e => {
          const keyTokens = e.ku.split(/\s+/);
          return inputTokens.every(t => keyTokens.includes(t));
        });
      }
      return match ? match.k : null;
    };

    rawNames.forEach(raw => {
      const key = pickKeyForRaw(String(raw).toUpperCase());
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
