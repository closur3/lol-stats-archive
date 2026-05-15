export const TOOLS_ACTIONS = `
          function readActionMessage(res, fallback) {
              return res.text().then(function(text) { return text || fallback; });
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
                  return readActionMessage(res, res.ok ? 'OK' : ('HTTP ' + res.status)).then(function(message) {
                      showResult(res.ok, res.ok ? ('✅ ' + message) : ('❌ ' + message));
                  });
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
          }

          function forceOne(slug, btnEl) {
              if (!requireAuth()) return;
              var restore = setButtonBusy(btnEl, '🔄');
              sendAuthorizedPost('/force', { 'Content-Type': 'application/json' }, JSON.stringify({ slugs: [slug] })).then(function(res) {
                  if (checkAuthError(res.status)) return;
                  return readActionMessage(res, res.ok ? 'OK' : ('HTTP ' + res.status)).then(function(message) {
                      showResult(res.ok, res.ok ? ('✅ ' + message) : ('❌ ' + message));
                  });
              }).catch(function() { showResult(false, NETWORK_ERROR_MSG); }).then(restore);
          }
`;
