import { dataUtils } from '../../utils/dataUtils.js';
import { sortPolicy } from '../../utils/sortPolicy.js';
import { mkSpine } from './spine.js';
import { dateUtils } from '../../utils/dateUtils.js';

const escapeHtml = (str) => {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
};

const escapeJsString = (str) => {
  if (!str) return "";
  return escapeHtml(str).replace(/\//g, "&#x2F;");
};

export function buildTeamRow(teamStats, slug, sortMeta = {}) {
  const bo3Rate = dataUtils.rate(teamStats.bestOf3FullMatchCount, teamStats.bestOf3TotalMatchCount);
  const bo5Rate = dataUtils.rate(teamStats.bestOf5FullMatchCount, teamStats.bestOf5TotalMatchCount);
  const winRate = dataUtils.rate(teamStats.seriesWinCount, teamStats.seriesTotalMatchCount);
  const gameRate = dataUtils.rate(teamStats.gameWinCount, teamStats.gameTotalCount);
  const bo3BayesTieBreakRate = sortPolicy.getBestOfBayesTieBreakRate(teamStats, 3, sortMeta.bo3PriorMean);
  const bo5BayesTieBreakRate = sortPolicy.getBestOfBayesTieBreakRate(teamStats, 5, sortMeta.bo5PriorMean);
  const bo3Text = teamStats.bestOf3TotalMatchCount ? mkSpine(`${teamStats.bestOf3FullMatchCount}/${teamStats.bestOf3TotalMatchCount}`, '/') : "-";
  const bo5Text = teamStats.bestOf5TotalMatchCount ? mkSpine(`${teamStats.bestOf5FullMatchCount}/${teamStats.bestOf5TotalMatchCount}`, '/') : "-";
  const seriesText = teamStats.seriesTotalMatchCount ? mkSpine(`${teamStats.seriesWinCount}-${teamStats.seriesTotalMatchCount - teamStats.seriesWinCount}`, '-') : "-";
  const gameText = teamStats.gameTotalCount ? mkSpine(`${teamStats.gameWinCount}-${teamStats.gameTotalCount - teamStats.gameWinCount}`, '-') : "-";
  const streak = teamStats.winStreakCount > 0
    ? `<span class='badge' style='background:#10b981'>${teamStats.winStreakCount}W</span>`
    : (teamStats.lossStreakCount > 0 ? `<span class='badge' style='background:#f43f5e'>${teamStats.lossStreakCount}L</span>` : "-");
  const lastMatch = teamStats.last ? dateUtils.fmtDate(teamStats.last) : "-";
  const lastMatchColor = dateUtils.colorDate(teamStats.last);

  const safeName = escapeJsString(teamStats.name);
  const safeDisplayName = escapeHtml(teamStats.name);

  const emptyBackground = '#f1f5f9', emptyColor = '#cbd5e1';
  const getClass = (baseClass, count) => count > 0 ? `${baseClass} team-clickable` : baseClass;
  const getClickHandler = (name, type, count) => count > 0 ? `onclick="openStats('${slug}', '${name}', '${type}')"` : "";
  const statStyle = (count) => `style="background:${count === 0 ? emptyBackground : 'transparent'};color:${count === 0 ? emptyColor : 'inherit'}"`;
  const percentStyle = (rate, strong = false) => `style="background:${dataUtils.color(rate, strong)};color:${rate !== null ? 'white' : emptyColor};font-weight:bold"`;
  const lastStyle = `style="background:${!teamStats.last ? emptyBackground : 'transparent'};color:${!teamStats.last ? emptyColor : lastMatchColor};font-weight:700"`;
  const streakEmpty = teamStats.winStreakCount === 0 && teamStats.lossStreakCount === 0;
  const streakStyle = `style="background:${streakEmpty ? emptyBackground : 'transparent'};color:${streakEmpty ? emptyColor : 'inherit'}"`;

  return `<tr><td class="team-col team-clickable" onclick="openTeam('${slug}', '${safeName}')">${safeDisplayName}</td>` +
    `<td class="${getClass('col-bo3', teamStats.bestOf3TotalMatchCount)}" ${getClickHandler(safeName, 'bo3', teamStats.bestOf3TotalMatchCount)} ${statStyle(teamStats.bestOf3TotalMatchCount)}>${bo3Text}</td>` +
    `<td class="col-bo3-pct" data-bayes-tie="${bo3BayesTieBreakRate}" data-sample-size="${teamStats.bestOf3TotalMatchCount || 0}" ${percentStyle(bo3Rate, true)}>${dataUtils.pct(bo3Rate)}</td>` +
    `<td class="${getClass('col-bo5', teamStats.bestOf5TotalMatchCount)}" ${getClickHandler(safeName, 'bo5', teamStats.bestOf5TotalMatchCount)} ${statStyle(teamStats.bestOf5TotalMatchCount)}>${bo5Text}</td>` +
    `<td class="col-bo5-pct" data-bayes-tie="${bo5BayesTieBreakRate}" data-sample-size="${teamStats.bestOf5TotalMatchCount || 0}" ${percentStyle(bo5Rate, true)}>${dataUtils.pct(bo5Rate)}</td>` +
    `<td class="${getClass('col-series', teamStats.seriesTotalMatchCount)}" ${getClickHandler(safeName, 'series', teamStats.seriesTotalMatchCount)} ${statStyle(teamStats.seriesTotalMatchCount)}>${seriesText}</td>` +
    `<td class="col-series-wr" ${percentStyle(winRate)}>${dataUtils.pct(winRate)}</td>` +
    `<td class="col-game" ${statStyle(teamStats.gameTotalCount)}>${gameText}</td>` +
    `<td class="col-game-wr" ${percentStyle(gameRate)}>${dataUtils.pct(gameRate)}</td>` +
    `<td class="col-streak" ${streakStyle}>${streak}</td>` +
    `<td class="col-last" ${lastStyle}><span class="utc-local" data-utc="${teamStats.last || ''}" data-format="datetime">${lastMatch}</span></td></tr>`;
}