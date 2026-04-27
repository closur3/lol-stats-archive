import toolsCSS from '../../styles/tools.js';
import { renderFontLinks, renderNavBar, renderBuildFooter } from './page.js';

export function renderToolsPage(time, sha, activeTournaments = [], archivedTournaments = []) {
  const buildFooter = renderBuildFooter(time, sha);

  let activeListHtml = activeTournaments.map(activeTournament => {
      const slug = activeTournament.slug;
      const name = activeTournament.name.replace(/'/g, '&apos;');
      return `
      <div class="item">
          <label class="item-left">
              <input type="checkbox" class="item-chk" value="${slug}">
              <span class="item-name">${activeTournament.name}</span>
          </label>
          <div class="item-right">
              <button class="icon-btn" onclick="forceOne('${slug}', this)" title="Force">🔄</button>
              <button class="icon-btn icon-btn-del" onclick="deleteArchive('${slug}', '${name}')" title="Delete">🗑️</button>
          </div>
      </div>`;
  }).join("");
  if (!activeListHtml) activeListHtml = "<div style='text-align:center; padding:12px 0; color:#94a3b8; font-size:12px;'>No active</div>";

  let archiveListHtml = archivedTournaments.map(archiveTournament => {
      const overviewStr = Array.isArray(archiveTournament.overview_page) ? JSON.stringify(archiveTournament.overview_page) : JSON.stringify([archiveTournament.overview_page]);
      const startDate = archiveTournament.start_date || '';
      const endDate = archiveTournament.end_date || '';
      const archiveNameEscaped = (archiveTournament.name || '').replace(/'/g, '&apos;');
      return `
      <div class="item">
          <label class="item-left">
              <input type="checkbox" class="item-chk qr-chk-archived" value="${archiveTournament.slug}" data-name="${archiveTournament.name}" data-overview='${overviewStr}' data-league="${archiveTournament.league}" data-start="${startDate}" data-end="${endDate}">
              <span class="item-name">${archiveTournament.name}</span>
          </label>
          <div class="item-right">
              <button class="icon-btn icon-btn-fill" onclick="fillArchive('${archiveTournament.slug}')" title="Fill">📋</button>
              <button class="icon-btn icon-btn-del" onclick="deleteArchive('${archiveTournament.slug}', '${archiveNameEscaped}')" title="Delete">🗑️</button>
          </div>
      </div>`;
  }).join("");
  if (!archiveListHtml) archiveListHtml = "<div style='text-align:center; padding:12px 0; color:#94a3b8; font-size:12px;'>No archives</div>";

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

      <script>
          var authOverlay = document.getElementById("auth-overlay");
          var authPwdInput = document.getElementById("auth-pwd");
          var toastContainer = document.getElementById("toast-container");
          var TOAST_DURATION_MS = 3000;
          var REDIRECT_DELAY_MS = 1500;
          var AUTH_ERROR_MSG = "🔒 Session expired or incorrect password.";
          var NETWORK_ERROR_MSG = "❌ Network connection failed";
          var adminToken = sessionStorage.getItem("admin_pwd") || "";
          if (adminToken) authOverlay.style.display = "none";

          document.getElementById('chk-active-all').addEventListener('change', function() {
              document.querySelectorAll('#active-list .item-chk').forEach(function(checkboxElement) { checkboxElement.checked = this.checked; }.bind(this));
          });
          document.getElementById('chk-archived-all').addEventListener('change', function() {
              document.querySelectorAll('.qr-chk-archived').forEach(function(checkboxElement) { checkboxElement.checked = this.checked; }.bind(this));
          });

          function setAuthOverlayVisible(visible) { authOverlay.style.display = visible ? "flex" : "none"; }
          function clearAuth() { sessionStorage.removeItem("admin_pwd"); adminToken = ""; authPwdInput.value = ""; setAuthOverlayVisible(true); }
          function showToast(message, type) {
              type = type || 'success';
              var toast = document.createElement('div');
              toast.className = 'toast ' + type; toast.innerText = message;
              toastContainer.appendChild(toast); void toast.offsetWidth; toast.classList.add('show');
              setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, TOAST_DURATION_MS);
          }
          function unlockTools() { var password = authPwdInput.value.trim(); if (password) { adminToken = password; sessionStorage.setItem('admin_pwd', password); setAuthOverlayVisible(false); } }
          function checkAuthError(status) { if (status === 401) { showToast(AUTH_ERROR_MSG, "error"); clearAuth(); return true; } return false; }
          function requireAuth() { if (adminToken) return true; setAuthOverlayVisible(true); return false; }
          function getAuthHeaders(extra) { return Object.assign({ 'Authorization': 'Bearer ' + adminToken }, extra || {}); }
          function setButtonBusy(button, busyText) {
              var originalText = button.innerHTML; button.innerHTML = busyText; button.style.pointerEvents = 'none'; button.style.opacity = '0.7';
              return function() { button.innerHTML = originalText; button.style.pointerEvents = 'auto'; button.style.opacity = '1'; };
          }
          function sendAuthorizedPost(url, extraHeaders, body) {
              return fetch(url, { method: 'POST', headers: getAuthHeaders(extraHeaders), body: body });
          }
          function showResult(ok, text) { showToast(text, ok ? 'success' : 'error'); }

          function runTask(url, btnEl, busyText) {
              if (!requireAuth()) return;
              var restore = setButtonBusy(btnEl, busyText || '...');
              fetch(url, { method: 'POST', headers: getAuthHeaders() }).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
          }

          function forceSelected() {
              if (!requireAuth()) return;
              var checked = document.querySelectorAll('#active-list .item-chk:checked');
              if (checked.length === 0) { showToast("⚠️ No active selected", "error"); return; }
              var slugs = Array.from(checked).map(function(checkboxElement) { return checkboxElement.value; });
              var button = event.target;
              var restore = setButtonBusy(button, 'Running...');
              sendAuthorizedPost('/force', { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: slugs })).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
          }

          function forceOne(slug, btnEl) {
              if (!requireAuth()) return;
              var restore = setButtonBusy(btnEl, '🔄');
              sendAuthorizedPost('/force', { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: [slug] })).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  showResult(res.ok, res.ok ? '✅ Done' : '❌ Failed: ' + res.status);
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
          }

          function rebuildSelected() {
              if (!requireAuth()) return;
              var checked = document.querySelectorAll('.qr-chk-archived:checked');
              if (checked.length === 0) { showToast("⚠️ No archives selected", "error"); return; }
              var selected = Array.from(checked).map(function(checkboxElement) { var rawOverview = (checkboxElement.dataset.overview || '').trim(); var parsedOverview; try { parsedOverview = JSON.parse(rawOverview); } catch (error) { showToast("❌ Invalid overview format for " + (checkboxElement.dataset.name || ''), "error"); throw error; } return { slug: (checkboxElement.value || '').trim(), name: (checkboxElement.dataset.name || '').trim(), overview_page: parsedOverview, league: (checkboxElement.dataset.league || '').trim(), start_date: (checkboxElement.dataset.start || '').trim(), end_date: (checkboxElement.dataset.end || '').trim() }; });
              var hasMissingField = selected.some(function(item) {
                  return !item.slug || !item.name || !item.overview_page || !item.league || !item.start_date || !item.end_date;
              });
              if (hasMissingField) { showToast("⚠️ Missing required fields", "error"); return; }
              var button = event.target;
              var restore = setButtonBusy(button, 'Rebuilding...');
              var success = 0, fail = 0;
              var promises = selected.map(function(selectedArchive) {
                  return sendAuthorizedPost('/rebuild-archive', { 'Content-Type': 'application/json' }, JSON.stringify(selectedArchive)).then(function(res) { if (res.ok) success++; else { fail++; res.text().then(function(errorMessage) { if (errorMessage) showToast('❌ ' + selectedArchive.name + ': ' + errorMessage, "error"); }); if (checkAuthError(res.status)) return; } }).catch(function() { fail++; });
              });
              Promise.all(promises).then(function() {
                  restore();
                  var total = success + fail;
                  var message = fail === 0
                      ? ('✅ Rebuild completed: ' + success + '/' + total)
                      : ('⚠️ Rebuild partial: ' + success + '/' + total);
                  showResult(fail === 0, message);
              });
          }

          function fillArchive(slug) {
              var checkboxElement = document.querySelector('.qr-chk-archived[value="' + slug + '"]');
              if (!checkboxElement) { showToast("❌ Archive item not found", "error"); return; }

              var overviewValue = "";
              var rawOverview = (checkboxElement.dataset.overview || "").trim();
              if (rawOverview) {
                  try {
                      var parsedOverview = JSON.parse(rawOverview);
                      if (Array.isArray(parsedOverview)) overviewValue = parsedOverview.join(", ");
                      else overviewValue = String(parsedOverview || "");
                  } catch (error) {
                      showToast("❌ Invalid overview data format", "error");
                      return;
                  }
              }

              document.getElementById('ma-slug').value = (checkboxElement.value || '').trim();
              document.getElementById('ma-name').value = (checkboxElement.dataset.name || '').trim();
              document.getElementById('ma-overview').value = overviewValue;
              document.getElementById('ma-league').value = (checkboxElement.dataset.league || '').trim();
              document.getElementById('ma-start').value = (checkboxElement.dataset.start || '').trim();
              document.getElementById('ma-end').value = (checkboxElement.dataset.end || '').trim();
              showToast("📋 Filled Manual Archive form", "success");
          }

          function deleteArchive(slug, name) {
              if (!requireAuth()) return;
              if (!confirm('Delete ' + name + '?')) return;
              sendAuthorizedPost('/delete-archive', { 'Content-Type': 'application/json' }, JSON.stringify({ slug: slug, name: name })).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  if (res.ok) { showResult(true, '🗑️ Deleted'); location.reload(); }
                  else { res.text().then(function(errorMessage) { showResult(false, errorMessage ? ('❌ ' + errorMessage) : '❌ Failed'); }); }
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); });
          }

          function submitManualArchive() {
              if (!requireAuth()) return;
              var payload = {
                  slug: document.getElementById('ma-slug').value.trim(),
                  name: document.getElementById('ma-name').value.trim(),
                  overview_page: document.getElementById('ma-overview').value.trim(),
                  league: document.getElementById('ma-league').value.trim(),
                  start_date: document.getElementById('ma-start').value.trim(),
                  end_date: document.getElementById('ma-end').value.trim()
              };
              if (!payload.slug || !payload.name || !payload.overview_page || !payload.league || !payload.start_date || !payload.end_date) { showToast("⚠️ Missing required fields", "error"); return; }
              sendAuthorizedPost('/manual-archive', { 'Content-Type': 'application/json' }, JSON.stringify(payload)).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  if (res.ok) { showResult(true, '📦 Saved'); setTimeout(function() { location.reload(); }, REDIRECT_DELAY_MS); }
                  else { res.text().then(function(errorMessage) { showResult(false, errorMessage ? ('❌ ' + errorMessage) : '❌ Failed'); }); }
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); });
          }
      </script>
  </body>
  </html>`;
}