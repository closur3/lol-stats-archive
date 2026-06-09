import { GITHUB_COMMIT_BASE } from '../../constants/index.js';
import homeCSS from '../../styles/home.js';
import { SORT_SCRIPT } from '../../client/sort.js';
import { MODAL_SCRIPT } from '../../client/modal.js';
import { TIME_TABLE_SCRIPT } from '../../client/timeTable.js';
import { PAGE_ACTIONS_SCRIPT } from '../../client/pageActions.js';

export function renderFontLinks() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;
}

export function renderNavBar(activeMode = "home") {
  const navItems = [
    { href: "/", label: "Home" },
    { href: "/archive", label: "Archive" },
    { href: "/logs", label: "Logs" },
    { href: "/tools", label: "Tools" }
  ];

  const desktopNav = navItems.map(item => {
    const isActive = (item.href === "/" && activeMode === "home") ||
                     (item.href === "/archive" && activeMode === "archive") ||
                     (item.href === "/tools" && activeMode === "tools") ||
                     (item.href === "/logs" && activeMode === "logs");
    return `<a class="nav-link${isActive ? ' active' : ''}" href="${item.href}">${item.label}</a>`;
  }).join("");

  const mobileNav = navItems.map(item => {
    const isActive = (item.href === "/" && activeMode === "home") ||
                     (item.href === "/archive" && activeMode === "archive") ||
                     (item.href === "/tools" && activeMode === "tools") ||
                     (item.href === "/logs" && activeMode === "logs");
    return `<a class="nav-mobile-link${isActive ? ' active' : ''}" href="${item.href}" onclick="document.getElementById('mobileMenu').classList.remove('open');document.getElementById('mobileOverlay').classList.remove('open');document.body.classList.remove('nav-mobile-open')">${item.label}</a>`;
  }).join("");

  return `
<header class="main-header"><div class="nav-container"><div class="nav-left"><span class="nav-logo">🥇</span><h1 class="nav-title"><a class="nav-title-link" href="/">LoL Stats</a></h1></div><div class="nav-right"><nav class="nav-links">${desktopNav}</nav><button class="nav-toggle" onclick="const menu=document.getElementById('mobileMenu');const overlay=document.getElementById('mobileOverlay');const isOpen=menu.classList.toggle('open');overlay.classList.toggle('open',isOpen);document.body.classList.toggle('nav-mobile-open',isOpen)" aria-label="Toggle menu"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg></button></div></div></header>
<div class="nav-mobile-overlay" id="mobileOverlay" onclick="document.getElementById('mobileMenu').classList.remove('open');this.classList.remove('open');document.body.classList.remove('nav-mobile-open')"></div>
<div class="nav-mobile-menu" id="mobileMenu"><nav class="nav-mobile-links">${mobileNav}</nav></div>`;
}

export function renderBuildFooter(time, sha, hasActiveCron = false) {
  const shortSha = (sha || "").slice(0, 7) || "unknown";
  const dotClass = hasActiveCron ? "active" : "idle";
  return `<div class="build-footer"><span class="cron-dot ${dotClass}"></span><span class="footer-label">deployed:</span> <span class="footer-time">${time || "N/A"}</span> <a href="${GITHUB_COMMIT_BASE}${sha}" target="_blank"><span class="footer-sha">@${shortSha}</span></a></div>`;
}

export function renderClientJS() {
  return `<script>${SORT_SCRIPT}${MODAL_SCRIPT}${TIME_TABLE_SCRIPT}${PAGE_ACTIONS_SCRIPT}</script>`;
}

function renderFloatingPageActions(navMode) {
  if (navMode !== "home" && navMode !== "archive") return "";
  return `<div class="floating-actions-anchor" id="floatingPageActionsAnchor" aria-hidden="true"></div><div class="floating-actions" id="floatingPageActions" aria-label="Page actions">
    <button type="button" class="floating-action-btn" id="floatingToggleLeagues" onclick="toggleAllLeagues()" aria-label="Expand all leagues">
      <svg class="floating-action-icon icon-expand" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/><path d="m17 15 3 3 3-3"/></svg>
      <svg class="floating-action-icon icon-collapse" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/><path d="m17 21 3-3 3 3"/></svg>
    </button>
    <button type="button" class="floating-action-btn" onclick="refreshCurrentPage()" aria-label="Refresh page">
      <svg class="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15 6.7"/><path d="M3 12a9 9 0 0 1 15-6.7"/><path d="M18 2v5h-5"/><path d="M6 22v-5h5"/></svg>
    </button>
    <button type="button" class="floating-action-btn" onclick="scrollToPageTop()" aria-label="Back to top">
      <svg class="floating-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/><path d="M12 9v12"/><path d="M5 3h14"/></svg>
    </button>
  </div>`;
}

export function renderPageShell(title, bodyContent, navMode = "home", time = null, sha = null, hasActiveCron = false, options = {}) {
  const {
    css = homeCSS,
    script = renderClientJS(),
    containerClass = "container",
    preBody = "",
    showModal = true
  } = options;
  const modalHtml = showModal ? '<div id="matchModal" class="modal"><div class="modal-content"><h3 id="modalTitle">Match History</h3><div id="modalList" class="match-list"></div></div></div>' : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>${renderFontLinks()}<style>${css}</style><link rel="icon" href="/favicon.ico"></head><body class="page-${navMode}">${preBody}${renderNavBar(navMode)}<div class="${containerClass}">${bodyContent}</div>${renderFloatingPageActions(navMode)}${renderBuildFooter(time, sha, hasActiveCron)}${modalHtml}${script}</body></html>`;
}
