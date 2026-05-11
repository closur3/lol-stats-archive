import toolsCSS from '../../styles/tools.js';
import { TOOLS_SCRIPT } from '../../client/tools.js';
import { escapeHtml } from '../../utils/htmlEscape.js';
import { renderFontLinks, renderNavBar, renderBuildFooter } from './page.js';
import { renderActiveTournamentList, renderArchivedTournamentList } from './toolsLists.js';

export function renderToolsPage(time, sha, activeTournaments = [], archivedTournaments = [], archiveError = null) {
  const buildFooter = renderBuildFooter(time, sha);
  const activeListHtml = renderActiveTournamentList(activeTournaments);
  const archiveListHtml = renderArchivedTournamentList(archivedTournaments);
  const archiveErrorHtml = archiveError
    ? `<div style="margin:0 0 10px; padding:10px 12px; border:1px solid #ef4444; border-radius:10px; color:#fecaca; background:rgba(127,29,29,.28); font-size:12px;">Archive index unavailable: ${escapeHtml(archiveError)}</div>`
    : "";

  return `<!DOCTYPE html>
  <html>
  <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tools</title>
      ${renderFontLinks()}
      <link rel="icon" href="/favicon.ico">
      <style>
          ${toolsCSS}
      </style>
  </head>
  <body>
      <div id="toast-container"></div>
      <div id="auth-overlay">
          <div class="auth-card">
              <div class="auth-icon">🔐</div>
              <input type="password" id="auth-pwd" class="form-input auth-input" placeholder="Password" onkeypress="if(event.key==='Enter') unlockTools()">
              <button class="primary-btn auth-btn" onclick="unlockTools()">Unlock</button>
          </div>
      </div>

      ${renderNavBar("tools")}

      <div class="container">

          <div class="wrapper">
              <div class="table-title"><span>⚙️ Operations</span></div>
              <div class="section-body ops-body">

                  <div class="group-header">
                      <input type="checkbox" class="group-chk" id="chk-active-all">
                      <span class="group-label">Active</span>
                  </div>
                  <div id="active-list" class="list">
                      ${activeListHtml}
                  </div>
                  <div class="ops-actions">
                      <button class="secondary-btn" onclick="runTask('/refresh-ui', this, 'Refreshing...')">Refresh UI</button>
                      <button class="primary-btn" onclick="forceSelected()">Force Update</button>
                  </div>

                  <div class="item-sep"></div>

                  <div class="group-header">
                      <input type="checkbox" class="group-chk" id="chk-archived-all">
                      <span class="group-label">Archived</span>
                  </div>
                  ${archiveErrorHtml}
                  <div class="list">
                      ${archiveListHtml}
                  </div>
                  <div class="ops-actions">
                      <button class="primary-btn" onclick="rebuildSelected()">Rebuild</button>
                  </div>

              </div>
          </div>

          <div class="wrapper">
              <div class="table-title">📦 Manual Archive</div>
              <div class="section-body">
                  <div class="form-grid">
                      <div class="form-group">
                          <label class="tool-label">Slug</label>
                          <input type="text" id="ma-slug" placeholder="lpl-2026-split-1" class="form-input" required>
                      </div>
                      <div class="form-group">
                          <label class="tool-label">Name</label>
                          <input type="text" id="ma-name" placeholder="LPL 2026 Split 1" class="form-input" required>
                      </div>
                      <div class="form-group">
                          <label class="tool-label">Overview Page</label>
                          <input type="text" id="ma-overview" placeholder="LPL/2026 Season/Split 1" class="form-input" required>
                      </div>
                      <div class="form-group">
                          <label class="tool-label">League</label>
                          <input type="text" id="ma-league" placeholder="LPL" class="form-input" required>
                      </div>
                      <div class="form-group">
                          <label class="tool-label">Start Date</label>
                          <input type="text" id="ma-start" placeholder="YYYY-MM-DD" class="form-input" required>
                      </div>
                      <div class="form-group">
                          <label class="tool-label">End Date</label>
                          <input type="text" id="ma-end" placeholder="YYYY-MM-DD" class="form-input" required>
                      </div>
                  </div>
                  <div class="actions-row-end">
                      <button class="primary-btn" onclick="submitManualArchive()">Save Metadata</button>
                  </div>
              </div>
          </div>
      </div>
      ${buildFooter}

      <script>${TOOLS_SCRIPT}</script>
  </body>
  </html>`;
}
