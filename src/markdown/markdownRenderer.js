import { dataUtils } from '../utils/dataUtils.js';
import { TIME_GRID_COLUMN_COUNT } from '../constants/index.js';
import { dateUtils } from '../utils/dateUtils.js';
import { generateFullRateString as generateFullRateStringCore } from '../core/analysis/fullRateStats.js';

export function generateFullRateString(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches) {
  const core = generateFullRateStringCore(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches);
  if (!core) return "";
  return `📊 **Fullrate**: ${core}\n\n`;
}

export function generateMarkdown(tournament, stats, timeGrid) {
  const sorted = dataUtils.sortTeams(stats);

  let bo3FullMatches = 0, bo3TotalMatches = 0, bo5FullMatches = 0, bo5TotalMatches = 0;
  sorted.forEach(teamStats => {
    bo3FullMatches += teamStats.bestOf3FullMatchCount || 0; bo3TotalMatches += teamStats.bestOf3TotalMatchCount || 0;
    bo5FullMatches += teamStats.bestOf5FullMatchCount || 0; bo5TotalMatches += teamStats.bestOf5TotalMatchCount || 0;
  });
  bo3FullMatches /= 2; bo3TotalMatches /= 2; bo5FullMatches /= 2; bo5TotalMatches /= 2;

  let fullRateStr = generateFullRateString(bo3FullMatches, bo3TotalMatches, bo5FullMatches, bo5TotalMatches);

  let markdown = `# ${tournament.name}\n\n${fullRateStr}| TEAM | BO3 FULL | BO3% | BO5 FULL | BO5% | SERIES | SERIES WR | GAMES | GAME WR | STREAK | LAST DATE |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  if (sorted.length === 0) {
    markdown += "| - | - | - | - | - | - | - | - | - | - | - |\n";
  } else {
    sorted.forEach(teamStats => {
      const bestOf3SummaryText = teamStats.bestOf3TotalMatchCount ? `${teamStats.bestOf3FullMatchCount}/${teamStats.bestOf3TotalMatchCount}` : "-";
      const bestOf3PercentText = dataUtils.pct(dataUtils.rate(teamStats.bestOf3FullMatchCount, teamStats.bestOf3TotalMatchCount));
      const bestOf5SummaryText = teamStats.bestOf5TotalMatchCount ? `${teamStats.bestOf5FullMatchCount}/${teamStats.bestOf5TotalMatchCount}` : "-";
      const bestOf5PercentText = dataUtils.pct(dataUtils.rate(teamStats.bestOf5FullMatchCount, teamStats.bestOf5TotalMatchCount));
      const seriesSummaryText = teamStats.seriesTotalMatchCount ? `${teamStats.seriesWinCount}-${teamStats.seriesTotalMatchCount - teamStats.seriesWinCount}` : "-";
      const seriesWinRateText = dataUtils.pct(dataUtils.rate(teamStats.seriesWinCount, teamStats.seriesTotalMatchCount));
      const gameSummaryText = teamStats.gameTotalCount ? `${teamStats.gameWinCount}-${teamStats.gameTotalCount - teamStats.gameWinCount}` : "-";
      const gameWinRateText = dataUtils.pct(dataUtils.rate(teamStats.gameWinCount, teamStats.gameTotalCount));
      const streakText = teamStats.winStreakCount > 0 ? `${teamStats.winStreakCount}W` : (teamStats.lossStreakCount > 0 ? `${teamStats.lossStreakCount}L` : "-");
      const lastMatchText = teamStats.last ? dateUtils.fmtDate(teamStats.last) : "-";
      markdown += `| ${teamStats.name} | ${bestOf3SummaryText} | ${bestOf3PercentText} | ${bestOf5SummaryText} | ${bestOf5PercentText} | ${seriesSummaryText} | ${seriesWinRateText} | ${gameSummaryText} | ${gameWinRateText} | ${streakText} | ${lastMatchText} |\n`;
    });
  }

  markdown += `\n## \n📅 **Time Slot Distribution**\n\n| Time Slot | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total |\n| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

  const regionGrid = timeGrid[tournament.slug] || {};
  const hours = Object.keys(regionGrid).filter(hourKey => hourKey !== "Total" && !isNaN(hourKey)).map(Number).sort((leftHour, rightHour) => leftHour - rightHour);

  [...hours, "Total"].forEach(hourOrTotal => {
    if (!regionGrid[hourOrTotal]) return;
    const label = hourOrTotal === "Total" ? `**Total**` : `**${String(hourOrTotal).padStart(2,'0')}:00**`;
    let line = `| ${label} |`;
    for (let weekdayIndex = 0; weekdayIndex < TIME_GRID_COLUMN_COUNT; weekdayIndex++) {
      const cell = regionGrid[hourOrTotal][weekdayIndex];
      if (!cell || cell.totalMatchCount === 0) line += " - |";
      else {
        const rate = Math.round((cell.fullLengthMatchCount / cell.totalMatchCount) * 100);
        line += ` ${cell.fullLengthMatchCount}/${cell.totalMatchCount} (${rate}%) |`;
      }
    }
    markdown += line + "\n";
  });

  return markdown;
}