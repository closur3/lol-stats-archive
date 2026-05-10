import logsCSS from '../../styles/logs.js';
import { renderFontLinks, renderNavBar, renderBuildFooter, renderClientJS } from './page.js';
import { resolveLeaguePhase } from '../../utils/leagueState.js';
import { escapeHtml, escapeUrl } from '../../utils/htmlEscape.js';

function formatDelta(entry) {
  const added = Number(entry?.added) || 0;
  const updated = Number(entry?.updated) || 0;
  if (entry.action === "SYNC") {
    let delta = "";
    if (added > 0) delta += `+${added}`;
    if (updated > 0) delta += `~${updated}`;
    return delta || "~0";
  }
  return `~${added + updated}`;
}

function renderTrigger(entry, icon) {
  if (entry.isForce) return ` | ${icon} Force`;
  const trigger = entry.trigger;
  if (!trigger?.diffUrl || trigger.revid == null) return "";
  return ` | ${icon} <a href="${escapeUrl(trigger.diffUrl)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${escapeHtml(trigger.revid)}</a>`;
}

function renderLogMessage(entry) {
  const suffix = entry.isAnon ? " 👻" : "";
  const displayName = escapeHtml(entry.displayName || "");
  if (entry.action === "SYNC") {
    return `🟢 [SYNC] | 🔄 ${displayName} ${formatDelta(entry)}${renderTrigger(entry, "➕")}${suffix}`;
  }
  if (entry.action === "SKIP") {
    return `⚪ [SKIP] | 🔍 ${displayName} ${formatDelta(entry)}${renderTrigger(entry, "🟰")}${suffix}`;
  }
  if (entry.action === "BREAKER") {
    return `🔴 [ERR!] | 🚧 ${displayName} ${escapeHtml(entry.dropInfo || "(Drop)")}${suffix}`;
  }
  if (entry.action === "API_ERROR") {
    return `🔴 [ERR!] | ❌ ${displayName} (Fail)${suffix}`;
  }
  throw new Error(`Invalid log entry action: ${entry.action}`);
}

function isSyncEntry(entry) {
  return entry.action === "SYNC";
}

function isErrorEntry(entry) {
  return entry.action === "BREAKER" || entry.action === "API_ERROR" || entry.level === "ERROR";
}

export function renderLogPage(leagueLogs, time, sha, options = {}) {
  if (!leagueLogs) leagueLogs = [];
  const maxLogEntries = Number(options.maxLogEntries);

  const leagueItems = Array.isArray(leagueLogs)
    ? leagueLogs
    : Object.keys(leagueLogs).map(name => ({ name, ...(leagueLogs[name] || {}) }));

  const cardsHtml = leagueItems.map(item => {
    const name = item.name || "";
    const safeName = escapeHtml(name);
    const entries = item.logs || [];
    const lastEntry = entries[0];
    const phase = resolveLeaguePhase(item);
    const phaseCls = `phase-${phase}`;
    const phaseEmoji = phase === "play" ? "🎮" : phase === "offday" ? "🕊️" : "⏳";
    const phaseEmojiCls = `phase-emoji-${phase}`;
    const phaseText = phase === "play" ? "PLAY" : phase === "offday" ? "OFFDAY" : "IDLE";

    const syncCount = entries.filter(isSyncEntry).length;
    const errCount = entries.filter(isErrorEntry).length;
    const totalCount = Number.isFinite(item.totalMatches) ? item.totalMatches : null;
    const lastTime = lastEntry?.timestamp || "";
    const lastUtcIso = lastTime.length >= 16 ? `20${lastTime.slice(0,8)}T${lastTime.slice(9)}:00Z` : "";

    const bars = entries.slice(0, 10).reverse().map(entry => {
      const cls = isSyncEntry(entry) ? "bar-sync" : isErrorEntry(entry) ? "bar-err" : "bar-idle";
      const barHeight = isSyncEntry(entry) ? "100%" : isErrorEntry(entry) ? "70%" : "30%";
      return `<div class="bar ${cls}" style="height:${barHeight}"></div>`;
    }).join("");

    const rows = entries.slice(0, maxLogEntries).map(entry => {
      const rowTime = entry.timestamp || "";
      const utcIso = rowTime.length >= 16 ? `20${rowTime.slice(0,8)}T${rowTime.slice(9)}:00Z` : "";
      const formattedMessage = renderLogMessage(entry).replace(/(\+\d+(?:~\d+)?|~\d+|±0)/g, '<span class="hl">$1</span>');
      return `<div class="log-mini-row"><span class="log-mini-time utc-local" data-utc="${escapeHtml(utcIso)}" data-format="datetime">${escapeHtml(rowTime)}</span><span class="log-mini-msg">${formattedMessage}</span></div>`;
    }).join("");

    return `<div class="league-card">
      <div class="league-card-header"><div class="league-card-title"><span class="league-card-name">${safeName}</span>${totalCount == null ? '' : `<span class="league-total-pill">${totalCount}</span>`}</div><div class="league-card-status"><span class="phase-tag ${phaseCls}"><span class="phase-emoji ${phaseEmojiCls}">${phaseEmoji}</span><span>${phaseText}</span></span></div></div>
      <div class="card-stats"><span>SYNC <span class="stat-val">${syncCount}</span></span><span>ERR <span class="stat-val">${errCount}</span></span><span>LAST <span class="stat-val utc-local" data-utc="${escapeHtml(lastUtcIso)}" data-format="datetime">${escapeHtml(lastTime)}</span></span></div>
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
