import { githubCommitBase } from '../../constants/index.js';
import activeCSS from '../../styles/active.js';
import { sortScript } from '../../client/sort.js';
import { modalScript } from '../../client/modal.js';
import { timeTableScript } from '../../client/timeTable.js';
import { tournamentSelectorsScript } from '../../client/tournamentSelectors.js';
import { statisticsScopesScript } from '../../client/statisticsScopes.js';
import { compactMenuScript } from '../../client/compactMenu.js';
import { footerCronInfoScript } from '../../client/footerCronInfo.js';
import { assertCronInfo, unavailableCronInfo } from '../../core/scheduler/cronInfo.js';
import { escapeHtml } from '../../utils/htmlEscape.js';

function renderFontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;
}

function renderNavBar(activeMode = "active") {
  const navItems = [{ href: "/", label: "Active" }, { href: "/archive", label: "Archive" }, { href: "/logs", label: "Logs" }, { href: "/tools", label: "Tools" }];
  const isActiveLink = href => (href === "/" && activeMode === "active") || (href === "/archive" && activeMode === "archive") || (href === "/tools" && activeMode === "tools") || (href === "/logs" && activeMode === "logs");
  const desktopNav = navItems.map(item => `<a class="nav-link${isActiveLink(item.href) ? " active" : ""}" href="${item.href}">${item.label}</a>`).join("");
  return `<header class="main-header"><div class="nav-container"><div class="nav-left"><span class="nav-logo">🥇</span><h1 class="nav-title"><a class="nav-title-link" href="/">LoL Stats</a></h1></div><div class="nav-right"><nav class="nav-links">${desktopNav}</nav></div></div></header>`;
}

function renderCronSchedules(cronInfo) {
  return cronInfo.schedules.map(schedule => `<span class="footer-cron-schedule"><code>${escapeHtml(schedule.expression)}</code><span class="footer-cron-cst"><span class="footer-cron-period">${escapeHtml(schedule.cst.period)}</span><span>${escapeHtml(schedule.cst.timeRange)}</span><span>(${escapeHtml(schedule.cst.frequency)}, CST)</span></span></span>`).join("");
}

function renderBuildFooter(time, sha, cronInfo) {
  const normalizedCronInfo = assertCronInfo(cronInfo);
  const shortSha = (sha || "").slice(0, 7) || "unknown";
  const cronPanel = `<span class="footer-cron-info ${normalizedCronInfo.status}"><button type="button" class="footer-cron-trigger" aria-label="Cron schedule information" aria-haspopup="dialog" aria-expanded="false" aria-controls="footerCronPanel" onclick="event.stopPropagation(); toggleFooterCronInfo(this)"><span class="cron-dot" aria-hidden="true"></span></button><span id="footerCronPanel" class="footer-cron-panel" role="dialog" aria-label="Cron schedules" aria-hidden="true" onclick="event.stopPropagation()"><span class="footer-cron-header"><span class="footer-cron-label">CRON SCHEDULES</span><span class="footer-cron-state"><span class="footer-cron-panel-dot" aria-hidden="true"></span><span class="footer-cron-status">${normalizedCronInfo.status.toUpperCase()}</span></span></span><span class="footer-cron-schedules">${renderCronSchedules(normalizedCronInfo)}</span></span></span>`;
  return `<div class="build-footer">${cronPanel}<span class="footer-label">deployed:</span> <span class="footer-time">${time || "N/A"}</span> <a href="${githubCommitBase}${sha}" target="_blank"><span class="footer-sha">@${shortSha}</span></a></div>`;
}

function renderClientJs() { return `<script>${sortScript}${modalScript}${compactMenuScript}${timeTableScript}${statisticsScopesScript}${tournamentSelectorsScript}</script>`; }

function renderTournamentSelector(navMode) {
  if (navMode === "active") return `<nav class="floating-selector league-selector" id="leagueSelector" aria-label="League selector"></nav>`;
  if (navMode === "archive") return `<nav class="floating-selector archive-tournament-list" id="archiveTournamentList" aria-label="Archive tournaments"></nav><select class="floating-selector archive-tournament-selector" id="archiveTournamentSelector" aria-label="Archive tournament selector" disabled></select>`;
  return "";
}

export function renderPageShell(title, bodyContent, navMode = "active", time = null, sha = null, cronInfo = unavailableCronInfo(), options = {}) {
  const { css = activeCSS, script = renderClientJs(), containerClass = "container", preBody = "", showModal = true, showTournamentSelector = true } = options;
  const modalHtml = showModal ? '<div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>' : "";
  const tournamentSelectorHtml = showTournamentSelector ? renderTournamentSelector(navMode) : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>${renderFontLinks()}<style>${css}</style><link rel="icon" href="/favicon.ico"></head><body class="page-${navMode}">${preBody}${renderNavBar(navMode)}<div class="${containerClass}">${bodyContent}</div>${tournamentSelectorHtml}${renderBuildFooter(time, sha, cronInfo)}${modalHtml}${script}<script>${footerCronInfoScript}</script></body></html>`;
}
