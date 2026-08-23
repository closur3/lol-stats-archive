import errorCSS from "../../styles/error.js";
import { escapeHtml } from "../../utils/htmlEscape.js";
import { renderPageShell } from "./page.js";
import { renderSchemaIssueCards } from "../components/schemaIssueCards.js";
import { unavailableCronInfo } from "../../core/scheduler/cronInfo.js";

export function renderDataErrorPage(error, time, sha, page) {
  const message = error instanceof Error ? error.message : String(error);
  const issueList = renderSchemaIssueCards(Array.isArray(error?.issues) ? error.issues : []);
  const body = `<main class="error-layout">
    <div class="error-content">
      <div class="error-code">500 Internal Server Error</div>
      <h2 class="error-title">${escapeHtml(page.dataLabel)} data is not ready</h2>
      <p class="error-detail">${escapeHtml(message)}</p>
      ${issueList}
      <div class="error-actions">
        <a class="error-action error-action-primary" href="/tools">Open Tools</a>
        <a class="error-action" href="${escapeHtml(page.retryHref)}">Retry</a>
      </div>
    </div>
  </main>`;
  return renderPageShell(`${page.dataLabel} Error`, body, page.navMode, time, sha, unavailableCronInfo(), {
    css: errorCSS,
    script: "",
    showModal: false,
    showTournamentSelector: false
  });
}
