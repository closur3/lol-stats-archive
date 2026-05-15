import { dataUtils } from '../../utils/dataUtils.js';
import { escapeHtml, escapeJsArg } from '../../utils/htmlEscape.js';

export function renderActiveTournamentList(activeTournaments = []) {
  const html = activeTournaments.map(activeTournament => {
    const slug = String(activeTournament.slug || "");
    const name = String(activeTournament.name || "");
    return `
      <div class="item">
          <label class="item-left">
              <input type="checkbox" class="item-chk" value="${escapeHtml(slug)}">
              <span class="item-name">${escapeHtml(name)}</span>
          </label>
          <div class="item-right">
              <button class="icon-btn" onclick="forceOne(${escapeJsArg(slug)}, this)" title="Force">🔄</button>
              <button class="icon-btn icon-btn-del" onclick="deleteArchive(${escapeJsArg(slug)}, ${escapeJsArg(name)})" title="Delete">🗑️</button>
          </div>
      </div>`;
  }).join("");
  return html || "<div style='text-align:center; padding:40px; color:#94a3b8;'>No active</div>";
}

export function renderArchivedTournamentList(archivedTournaments = []) {
  const html = archivedTournaments.map(archiveTournament => {
    const slug = String(archiveTournament.slug || "");
    const name = String(archiveTournament.name || "");
    const league = String(archiveTournament.league || "");
    const overviewStr = JSON.stringify(dataUtils.normalizeOverviewPages(archiveTournament.overview_page));
    const startDate = archiveTournament.start_date || '';
    const endDate = archiveTournament.end_date || '';
    return `
      <div class="item">
          <label class="item-left">
              <input type="checkbox" class="item-chk qr-chk-archived" value="${escapeHtml(slug)}" data-name="${escapeHtml(name)}" data-overview="${escapeHtml(overviewStr)}" data-league="${escapeHtml(league)}" data-start="${escapeHtml(startDate)}" data-end="${escapeHtml(endDate)}">
              <span class="item-name">${escapeHtml(name)}</span>
          </label>
          <div class="item-right">
              <button class="icon-btn icon-btn-fill" onclick="fillArchive(${escapeJsArg(slug)})" title="Fill">📋</button>
              <button class="icon-btn icon-btn-del" onclick="deleteArchive(${escapeJsArg(slug)}, ${escapeJsArg(name)})" title="Delete">🗑️</button>
          </div>
      </div>`;
  }).join("");
  return html || "<div style='text-align:center; padding:40px; color:#94a3b8;'>No archive</div>";
}
