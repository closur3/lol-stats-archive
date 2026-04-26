const STYLE_RATE_HINT = 'style="font-weight:400;color:#94a3b8;font-size:11px;margin:0 2px"';

export function getRateHtml(teamName, slug, bestOf, globalStats) {
  const teamStats = globalStats[slug];
  if (!teamStats || !teamStats[teamName]) return "";

  const teamData = teamStats[teamName];
  let count = null, total = null;

  if (bestOf === 5) {
    count = teamData.bestOf5FullMatchCount;
    total = teamData.bestOf5TotalMatchCount;
  } else if (bestOf === 3) {
    count = teamData.bestOf3FullMatchCount;
    total = teamData.bestOf3TotalMatchCount;
  }

  if (count == null || !total) return "";
  const winRate = count / total;
  return `<span ${STYLE_RATE_HINT}>(${Math.round(winRate * 100)}%)</span>`;
}