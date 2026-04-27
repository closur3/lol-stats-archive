import logsCSS from '../../styles/logs.js';
import { renderFontLinks, renderNavBar, renderBuildFooter, renderClientJS } from './page.js';

export function renderLogPage(leagueLogs, time, sha, options = {}) {
  if (!leagueLogs) leagueLogs = [];
  const slowThresholdMinutes = Number(options.slowThresholdMinutes);
  const cronIntervalMinutes = Number(options.cronIntervalMinutes);
  const maxLogEntries = Number(options.maxLogEntries);

  const leagueItems = Array.isArray(leagueLogs)
    ? leagueLogs
    : Object.keys(leagueLogs).map(name => ({ name, ...(leagueLogs[name] || {}) }));

  const cardsHtml = leagueItems.map(item => {
    const name = item.name || "";
    const entries = item.logs || [];
    const lastEntry = entries[0];
    const isSlow = item.mode === "slow";
    const modeCls = isSlow ? "mode-slow" : "mode-fast";

    const syncCount = entries.filter(entry => entry.message.includes("🔄")).length;
    const errCount = entries.filter(entry => entry.message.includes("❌") || entry.message.includes("🚧")).length;
    const totalCount = Number.isFinite(item.totalMatches) ? item.totalMatches : null;
    const lastTime = lastEntry?.timestamp || "";
    const lastUtcIso = lastTime.length >= 16 ? `20${lastTime.slice(0,8)}T${lastTime.slice(9)}:00Z` : "";

    const bars = entries.slice(0, 10).reverse().map(entry => {
      const cls = entry.message.includes("🔄") ? "bar-sync" : entry.message.includes("❌") ? "bar-err" : "bar-idle";
      const barHeight = entry.message.includes("🔄") ? "100%" : entry.message.includes("❌") ? "70%" : "30%";
      return `<div class="bar ${cls}" style="height:${barHeight}"></div>`;
    }).join("");

    const rows = entries.slice(0, maxLogEntries).map(entry => {
      const rowTime = entry.timestamp || "";
      const utcIso = rowTime.length >= 16 ? `20${rowTime.slice(0,8)}T${rowTime.slice(9)}:00Z` : "";
      const formattedMessage = entry.message.replace(/(\+\d+(?:~\d+)?|~\d+|±0)/g, '<span class="hl">$1</span>');
      return `<div class="log-mini-row"><span class="log-mini-time utc-local" data-utc="${utcIso}" data-format="datetime">${rowTime}</span><span class="log-mini-msg">${formattedMessage}</span></div>`;
    }).join("");

    return `<div class="league-card">
      <div class="league-card-header"><div class="league-card-title"><span class="league-card-name">${name}</span>${totalCount == null ? '' : `<span class="league-total-pill">${totalCount}</span>`}</div><div class="league-card-status"><span class="mode-tag ${modeCls}">${isSlow?`🐌${slowThresholdMinutes}m`:`⚡${cronIntervalMinutes}m`}</span></div></div>
      <div class="card-stats"><span>SYNC <span class="stat-val">${syncCount}</span></span><span>ERR <span class="stat-val">${errCount}</span></span><span>LAST <span class="stat-val utc-local" data-utc="${lastUtcIso}" data-format="datetime">${lastTime}</span></span></div>
      <div class="timeline">${bars}</div>
      <div class="league-card-logs">${rows}</div>
    </div>`;
  }).join("");

  const buildFooter = renderBuildFooter(time, sha);

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Logs</title>
    ${renderFontLinks()}
    <link rel="icon" href="/favicon.ico">
    <style>
        ${logsCSS}
    </style>
</head>
<body>
    ${renderNavBar("logs")}
    <div class="logs-cards-container">
        ${cardsHtml || '<div class="empty-logs">No logs found</div>'}
    </div>
    ${buildFooter}
    ${renderClientJS()}
</body>
</html>`;
}