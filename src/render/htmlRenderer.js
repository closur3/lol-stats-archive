import { renderContentOnly } from './templates/content.js';
import { renderPageShell, renderNavBar, renderFontLinks, renderBuildFooter } from './templates/page.js';
import { renderToolsPage } from './templates/tools.js';
import { renderLogPage } from './templates/logs.js';
import { generateFullRateString as generateFullRateStringCore, generateMarkdown as generateMarkdownCore } from './markdownBuilder.js';

export class HTMLRenderer {
  static renderContentOnly = renderContentOnly;

  static renderActionBtn(href, icon, text) {
    return `<a href="${href}" class="action-btn"><span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span></a>`;
  }

  static renderFontLinks = renderFontLinks;
  static renderNavBar = renderNavBar;
  static renderPageShell = renderPageShell;
  static renderBuildFooter = renderBuildFooter;
  static renderToolsPage = renderToolsPage;
  static renderLogPage = renderLogPage;

  static generateFullRateString(bestOf3FullMatchCount, bestOf3TotalMatchCount, bestOf5FullMatchCount, bestOf5TotalMatchCount) {
    return generateFullRateStringCore(bestOf3FullMatchCount, bestOf3TotalMatchCount, bestOf5FullMatchCount, bestOf5TotalMatchCount);
  }

  static generateMarkdown(tournament, stats, timeGrid) {
    return generateMarkdownCore(tournament, stats, timeGrid);
  }
}