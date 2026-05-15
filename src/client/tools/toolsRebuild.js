export const TOOLS_REBUILD = `
          function rebuildSelected() {
              if (!requireAuth()) return;
              var checked = document.querySelectorAll('.qr-chk-archived:checked');
              if (checked.length === 0) { showToast("⚠️ No archive selected", "error"); return; }
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
`;
