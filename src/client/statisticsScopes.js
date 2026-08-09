export const statisticsScopesScript = `
function closeTournamentInfoPanels() {
  document.querySelectorAll('.tournament-info.is-open').forEach(info => {
    info.classList.remove('is-open');
    const trigger = info.querySelector('.tournament-info-trigger');
    const panel = info.querySelector('.tournament-info-panel');
    if (!trigger || !panel) throw new Error('Tournament info structure invalid');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
  });
}

function positionTournamentInfoPanel(panel) {
  const title = panel.closest('.table-title');
  if (!title) throw new Error('Tournament info title missing');
  panel.style.setProperty('--tournament-info-shift', '0px');
  const bounds = panel.getBoundingClientRect();
  const titleBounds = title.getBoundingClientRect();
  const viewportRight = document.documentElement.clientWidth;
  const boundaryLeft = Math.max(0, titleBounds.left);
  const boundaryRight = Math.min(viewportRight, titleBounds.right);
  let shift = 0;
  if (bounds.left < boundaryLeft) shift = boundaryLeft - bounds.left;
  if (bounds.right > boundaryRight) shift = boundaryRight - bounds.right;
  panel.style.setProperty('--tournament-info-shift', shift + 'px');
}

function toggleTournamentInfoPanel(trigger) {
  if (!(trigger instanceof HTMLButtonElement)) throw new Error('Tournament info trigger invalid');
  const info = trigger.closest('.tournament-info');
  if (!info) throw new Error('Tournament info missing');
  const panel = info.querySelector('.tournament-info-panel');
  if (!panel) throw new Error('Tournament info panel missing');
  const shouldOpen = !info.classList.contains('is-open');
  closeTournamentInfoPanels();
  closeCompactMenus();
  if (!shouldOpen) return;

  info.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  panel.setAttribute('aria-hidden', 'false');
  positionTournamentInfoPanel(panel);
}

function setStatisticsScope(scopeOption) {
  if (!(scopeOption instanceof HTMLButtonElement)) throw new Error('Statistics scope option invalid');
  const root = scopeOption.closest('.statistics-root');
  if (!root) throw new Error('Statistics root missing');

  const scope = scopeOption.dataset.statisticsScopeValue;
  if (!scope) throw new Error('Statistics scope value missing');
  const scopeLabel = scopeOption.dataset.statisticsScopeLabel;
  if (!scopeLabel) throw new Error('Statistics scope label missing');
  closeTournamentInfoPanels();
  const targets = ['content', 'schedule', 'summary', 'legend'];
  for (const target of targets) {
    const elements = [...root.querySelectorAll('[data-statistics-scope-' + target + ']')];
    if (elements.length === 0) continue;
    const active = elements.filter(element => element.dataset['statisticsScope' + target[0].toUpperCase() + target.slice(1)] === scope);
    if (active.length !== 1) throw new Error('Statistics scope ' + target + ' mismatch: ' + scope);
    for (const element of elements) {
      const isActive = element === active[0];
      element.classList.toggle('is-hidden', !isActive);
      element.setAttribute('aria-hidden', String(!isActive));
    }
  }

  const scopeMenu = scopeOption.closest('.statistics-scope-select');
  if (!scopeMenu) throw new Error('Statistics scope menu missing');
  const triggerLabel = scopeMenu.querySelector('.compact-menu-value');
  if (!triggerLabel) throw new Error('Statistics scope trigger label missing');
  triggerLabel.textContent = scopeLabel;
  scopeMenu.querySelectorAll('.compact-menu-option').forEach(option => {
    const isSelected = option === scopeOption;
    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-selected', String(isSelected));
  });
  closeCompactMenus();
  root.dataset.statisticsScope = scope;
  root.open = true;
  if (typeof updateTournamentToggleButton === 'function') updateTournamentToggleButton();
  if (typeof syncFloatingActionsMobilePosition === 'function') syncFloatingActionsMobilePosition();
}
document.addEventListener('click', closeTournamentInfoPanels);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeTournamentInfoPanels();
});
window.closeTournamentInfoPanels = closeTournamentInfoPanels;
window.toggleTournamentInfoPanel = toggleTournamentInfoPanel;
window.setStatisticsScope = setStatisticsScope;
`;
