import { dataUtils } from '../../utils/dataUtils.js';

export function calculateFullRateStats(sortedStats) {
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

export function generateFullRateString(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches) {
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