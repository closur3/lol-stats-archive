import { githubCommitBase } from '../../constants/index.js';
import activeCSS from '../../styles/active.js';
import { sortScript } from '../../client/sort.js';
import { modalScript } from '../../client/modal.js';
import { timeTableScript } from '../../client/timeTable.js';
import { pageActionsScript } from '../../client/pageActions.js';
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
  const mobileNav = navItems.map(item => `<a class="nav-mobile-link${isActiveLink(item.href) ? " active" : ""}" href="${item.href}" onclick="document.getElementById('mobileMenu').classList.remove('open');document.getElementById('mobileOverlay').classList.remove('open');document.body.classList.remove('nav-mobile-open')">${item.label}</a>`).join("");
  return `
<header class="main-header"><div class="nav-container"><div class="nav-left"><span class="nav-logo">🥇</span><h1 class="nav-title"><a class="nav-title-link" href="/">LoL Stats</a></h1></div><div class="nav-right"><nav class="nav-links">${desktopNav}</nav><button class="nav-toggle" onclick="const menu=document.getElementById('mobileMenu');const overlay=document.getElementById('mobileOverlay');const isOpen=menu.classList.toggle('open');overlay.classList.toggle('open',isOpen);document.body.classList.toggle('nav-mobile-open',isOpen)" aria-label="Toggle menu"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg></button></div></div></header>
<div class="nav-mobile-overlay" id="mobileOverlay" onclick="document.getElementById('mobileMenu').classList.remove('open');this.classList.remove('open');document.body.classList.remove('nav-mobile-open')"></div>
<div class="nav-mobile-menu" id="mobileMenu"><nav class="nav-mobile-links">${mobileNav}</nav></div>`;
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

function renderClientJs() { return `<script>${sortScript}${modalScript}${compactMenuScript}${timeTableScript}${statisticsScopesScript}${pageActionsScript}</script>`; }

function renderFloatingPageActions(navMode) {
  if (navMode !== "active" && navMode !== "archive") return "";
  return `<div class="floating-actions-anchor" id="floatingPageActionsAnchor" aria-hidden="true"></div><div class="floating-actions" id="floatingPageActions" aria-label="Page actions">
    <div class="tournament-jump compact-menu" id="tournamentJump"><button type="button" class="tournament-jump-trigger compact-menu-trigger" aria-label="Jump to tournament" aria-expanded="false" disabled onclick="toggleCompactMenu(this)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></button><div class="tournament-jump-menu compact-menu-popup" role="listbox" aria-hidden="true" data-year-headings="${navMode === "archive"}"></div></div>
    <button type="button" class="floating-action-btn" onclick="refreshCurrentPage()" aria-label="Refresh page"><svg class="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15 6.7"/><path d="M3 12a9 9 0 0 1 15-6.7"/><path d="M18 2v5h-5"/><path d="M6 22v-5h5"/></svg></button>
    <button type="button" class="floating-action-btn" onclick="scrollToPageTop()" aria-label="Back to top"><svg class="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/><path d="M12 9v12"/><path d="M5 3h14"/></svg></button>
  </div>`;
}

export function renderPageShell(title, bodyContent, navMode = "active", time = null, sha = null, cronInfo = unavailableCronInfo(), options = {}) {
  const { css = activeCSS, script = renderClientJs(), containerClass = "container", preBody = "", showModal = true, showPageActions = true } = options;
  const modalHtml = showModal ? '<div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>' : "";
  const pageActionsHtml = showPageActions ? renderFloatingPageActions(navMode) : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>${renderFontLinks()}<style>${css}</style><link rel="icon" href="/favicon.ico"></head><body class="page-${navMode}">${preBody}${renderNavBar(navMode)}<div class="${containerClass}">${bodyContent}</div>${pageActionsHtml}${renderBuildFooter(time, sha, cronInfo)}${modalHtml}${script}<script>${footerCronInfoScript}</script></body></html>`;
}
