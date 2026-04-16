/**
 * 排序策略（单一事实来源）
 */
export const sortPolicy = {
  BO5_WEIGHT: 1.33,
  BAYES_PRIOR_STRENGTH: 4,

  bayesPosteriorRate: (fullCount, totalCount, priorMean, priorStrength = 4) => {
    const full = Number(fullCount) || 0;
    const total = Number(totalCount) || 0;
    const mean = Number.isFinite(priorMean) ? priorMean : 0.5;
    const k = Number(priorStrength) || 0;
    return (full + (mean * k)) / (total + k);
  },

  getTeamWeightedCounts: (teamStats = {}) => {
    const bo3Full = teamStats.bestOf3FullMatchCount || 0;
    const bo3Total = teamStats.bestOf3TotalMatchCount || 0;
    const bo5Full = teamStats.bestOf5FullMatchCount || 0;
    const bo5Total = teamStats.bestOf5TotalMatchCount || 0;
    const weightedFullMatchCount = bo3Full + (bo5Full * sortPolicy.BO5_WEIGHT);
    const weightedTotalMatchCount = bo3Total + (bo5Total * sortPolicy.BO5_WEIGHT);
    return { weightedFullMatchCount, weightedTotalMatchCount };
  },

  getWeightedPriorMean: (statsArray = []) => {
    let totalWeightedFullMatchCount = 0;
    let totalWeightedTotalMatchCount = 0;
    statsArray.forEach(teamStats => {
      const { weightedFullMatchCount, weightedTotalMatchCount } = sortPolicy.getTeamWeightedCounts(teamStats);
      totalWeightedFullMatchCount += weightedFullMatchCount;
      totalWeightedTotalMatchCount += weightedTotalMatchCount;
    });
    return totalWeightedTotalMatchCount > 0 ? (totalWeightedFullMatchCount / totalWeightedTotalMatchCount) : 0.5;
  },

  getBestOfPriorMean: (statsArray = [], bestOf = 3) => {
    const isBo5 = Number(bestOf) === 5;
    const fullKey = isBo5 ? "bestOf5FullMatchCount" : "bestOf3FullMatchCount";
    const totalKey = isBo5 ? "bestOf5TotalMatchCount" : "bestOf3TotalMatchCount";
    let totalFullMatchCount = 0;
    let totalMatchCount = 0;
    statsArray.forEach(teamStats => {
      totalFullMatchCount += teamStats[fullKey] || 0;
      totalMatchCount += teamStats[totalKey] || 0;
    });
    return totalMatchCount > 0 ? (totalFullMatchCount / totalMatchCount) : 0.5;
  },

  getBestOfBayesTieBreakRate: (teamStats = {}, bestOf = 3, priorMean = 0.5) => {
    const isBo5 = Number(bestOf) === 5;
    const full = isBo5 ? (teamStats.bestOf5FullMatchCount || 0) : (teamStats.bestOf3FullMatchCount || 0);
    const total = isBo5 ? (teamStats.bestOf5TotalMatchCount || 0) : (teamStats.bestOf3TotalMatchCount || 0);
    return sortPolicy.bayesPosteriorRate(full, total, priorMean, sortPolicy.BAYES_PRIOR_STRENGTH);
  }
};

