/**
 * CSS样式常量 - 从原worker文件分离
 */

// 基础通用样式
export const COMMON_STYLE = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, code, input, button, select, textarea { font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    body { background: #f1f5f9; color: #0f172a; margin: 0; padding: 0; overflow-x: hidden; min-height: 100dvh; display: flex; flex-direction: column; }
    body.nav-mobile-open { overflow: hidden; }

    /* Navigation Bar - VitePress style */
    .main-header { position: sticky; top: 0; z-index: 100; background: #fff; border-bottom: 1px solid #e2e8f0; width: 100%; }
    .nav-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 64px; }
    .nav-left { display: flex; align-items: center; gap: 8px; }
    .nav-right { display: flex; align-items: center; gap: 24px; }
    .nav-logo { font-size: 1.8rem; line-height: 1; }
    .nav-title { margin: 0; font-size: 1.5rem; font-weight: 600; color: #0f172a; letter-spacing: -0.3px; }
    .nav-title-link { color: inherit; text-decoration: none; }
    .nav-links { display: flex; align-items: center; gap: 20px; }
    .nav-link { display: inline-flex; align-items: center; padding: 0; font-size: 14px; font-weight: 500; color: #64748b; text-decoration: none; transition: color 0.2s; line-height: 64px; border-bottom: 2px solid transparent; }
    .nav-link:hover { color: #0f172a; }
    .nav-link.active { color: #0f172a; border-bottom-color: #0f172a; font-weight: 600; }
    .nav-toggle { display: none; background: none; border: none; cursor: pointer; padding: 8px; color: #64748b; }
    .nav-toggle:hover { color: #0f172a; }
    .nav-toggle svg { width: 20px; height: 20px; }
    .nav-mobile-overlay { display: none; position: fixed; top: 64px; right: 0; bottom: 0; left: 0; background: rgba(0,0,0,0.25); z-index: 99; }
    .nav-mobile-overlay.open { display: block; }
    .nav-mobile-menu { position: fixed; top: 64px; right: -50vw; width: 50vw; height: calc(100% - 64px); background: #fff; z-index: 100; transition: right 0.25s ease; box-shadow: -4px 0 12px rgba(0,0,0,0.08); display: flex; flex-direction: column; }
    .nav-mobile-menu.open { right: 0; }
    .nav-mobile-links { display: flex; flex-direction: column; padding: 8px 0; }
    .nav-mobile-link { display: block; padding: 12px 24px; font-size: 15px; font-weight: 500; color: #64748b; text-decoration: none; transition: all 0.15s; border-left: 2px solid transparent; }
    .nav-mobile-link:hover { background: #f8fafc; color: #0f172a; }
    .nav-mobile-link.active { color: #0f172a; border-left-color: #0f172a; font-weight: 600; background: #f8fafc; }

    @media (max-width: 650px) {
        .nav-links { display: none; }
        .nav-toggle { display: block; }
        .nav-container { padding: 0 16px; }
    }

    /* Global Container */
    .container, .logs-cards-container { max-width: 1400px; width: 100%; margin: 0 auto; padding: 40px 15px 40px 15px; box-sizing: border-box; }
`;

// 主页面样式
export const PYTHON_STYLE = `
    ${COMMON_STYLE}
    .container { max-width: 1400px; }
    .wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 25px; border: 1px solid #e2e8f0; box-sizing: border-box; display: flex; flex-direction: column; }
    .wrapper::-webkit-scrollbar, .match-list::-webkit-scrollbar { display: none; }
    .wrapper, .match-list { -ms-overflow-style: none; scrollbar-width: none; }
    table { width: 100%; min-width: 1000px; border-collapse: separate; border-spacing: 0; font-size: 14px; table-layout: fixed; margin: 0; border: none; }
    th { background: #f8fafc; padding: 14px 8px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.05); border: none !important; }
    th:hover { background: #eff6ff; color: #2563eb; }
    td { padding: 12px 8px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: inset -1px -1px 2px rgba(0, 0, 0, 0.04); border: none !important; }
    tr { border: none !important; }
    .team-col { position: sticky; left: 0; background: white !important; z-index: 10; text-align: left; font-weight: 600; padding-left: 15px; width: 80px; transition: 0.2s; box-shadow: inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px -1px 2px rgba(0, 0, 0, 0.04) !important; border: none !important; outline: none !important; }
    .team-clickable { cursor: pointer; }
    .team-clickable:hover { color: #2563eb; background-color: #eff6ff !important; }
    .table-title { font-weight: 600; display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 12px 12px 0 0; border: 1px solid #e2e8f0; border-bottom: none; box-sizing: border-box; min-height: 72px; padding: 12px 16px; }
    .table-title + .wrapper { border-top: none; border-radius: 0 0 12px 12px; }
    .league-title-text { color: #0f172a; font-weight: 600; line-height: 1.3; }
    .table-title .league-jump-btn { display: inline-flex; align-items: center; justify-content: center; color: #0f172a; text-decoration: none; flex-shrink: 0; line-height: 1; }
    .table-title .league-jump-btn svg { width: 13px; height: 13px; stroke-width: 2.6; }
    .table-title .league-jump-btn:hover { color: #2563eb; }
    details.home-sec { margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
    details.home-sec > summary.table-title { cursor: pointer; user-select: none; list-style: none; transition: background 0.2s; background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); box-shadow: inset 1px 0 2px rgba(0, 0, 0, 0.04), inset -1px 0 2px rgba(0, 0, 0, 0.04); }
    details.home-sec > summary.table-title::-webkit-details-marker { display: none; }
    details.home-sec > .table-title { border: none; border-radius: 0; box-shadow: none; }
    details.home-sec > .wrapper { margin-bottom: 0; border: none; border-radius: 0; box-shadow: none; }
    details.home-sec[open] > summary.table-title { border-radius: 12px 12px 0 0; border-bottom: none; }
    details.home-sec:not([open]) > summary.table-title { border-radius: 12px; border-bottom: 1px solid #e2e8f0; }
    .home-indicator { font-size: 18px; color: #2563eb; font-weight: 600; transition: transform 0.3s ease; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-right: 8px; }
    details.home-sec[open] .home-indicator { transform: rotate(90deg); }
    .table-title a { color: #2563eb; text-decoration: none; }
    details.arch-sec { background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 12px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.3s ease; display: block; }
    details.arch-sec[open] { box-shadow: 0 4px 16px rgba(37, 99, 235, 0.12); border-color: #2563eb; }
    summary.arch-sum { cursor: pointer; user-select: none; list-style: none; min-height: 72px; display: flex; padding: 12px 16px; background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); border-bottom: none; align-items: center; transition: background 0.2s; }
    summary.arch-sum::-webkit-details-marker { display: none; }
    details.arch-sec[open] summary.arch-sum { background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); }
    .arch-title-wrapper { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
    .arch-title-wrapper a { color: #0f172a; font-weight: 600; text-decoration: none; transition: color 0.2s; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .arch-title-wrapper a:hover { color: #2563eb; }
    .arch-indicator { font-size: 18px; color: #2563eb; font-weight: 600; transition: transform 0.3s ease; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; margin-right: 8px; }
    details.arch-sec[open] .arch-indicator { transform: rotate(90deg); }
    .col-bo3 { width: 70px; } .col-bo3-pct { width: 70px; } .col-bo5 { width: 70px; } .col-bo5-pct { width: 70px; }
    .col-series { width: 70px; } .col-series-wr { width: 70px; } .col-game { width: 70px; } .col-game-wr { width: 70px; }
    .col-streak { width: 70px; } .col-last { width: 150px; }
    .col-bo3, .col-bo3-pct, .col-bo5, .col-bo5-pct, .col-series, .col-series-wr, .col-game, .col-game-wr, .col-streak, .col-last, .sch-time, .hist-score, .col-date, .sch-fin-score, .sch-live-score { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: 0; }
    .spine-row { display: flex; justify-content: center; align-items: stretch; width: 100%; height: 100%; }
    .spine-l { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0; font-weight: 600; transition: background 0.15s; }
    .spine-r { flex: 1; flex-basis: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0; font-weight: 600; transition: background 0.15s; }
    .spine-sep { width: 12px; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; }
    .sch-row .spine-l { padding: 4px 5px; margin-left: 0; }
    .sch-row .spine-r { padding: 4px 5px; margin-right: 0; }
    .spine-l.clickable:hover, .spine-r.clickable:hover, .spine-sep.clickable:hover { background-color: #eff6ff; color: #2563eb; cursor: pointer; }
    .t-cell { display: flex; align-items: center; width: 100%; height: 100%; }
    .t-val { flex: 1; flex-basis: 0; text-align: right; font-weight: 600; padding-right: 4px; white-space: nowrap; }
    .t-pct { flex: 1; flex-basis: 0; text-align: left; opacity: 0.9; font-size: 11px; font-weight: 600; padding-left: 4px; white-space: nowrap; }
    .badge { color: white; border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #94a3b8; margin: 40px 0; }
    .sch-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 40px; width: 100%; align-items: start; }
    .sch-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; }
    .sch-header { padding: 12px 15px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155; display:flex; justify-content:space-between; }
    .sch-body { display: flex; flex-direction: column; flex: 1; padding-bottom: 0; }
    .sch-group-header { border-bottom: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0; padding: 4px 0; color: #475569; font-size: 11px; letter-spacing: 0.5px; }
    .sch-group-header .spine-l { justify-content: flex-end; padding-right: 2px; }
    .sch-group-header .spine-r { justify-content: flex-start; padding-left: 2px; opacity: 0.7; }
    .sch-group-header:first-child { border-top: none; }
    .sch-row { display: flex; align-items: stretch; padding: 0; border-bottom: 1px solid #f8fafc; font-size: 14px; color: #334155; min-height: 36px; flex: 0 0 auto; }
    .sch-time { width: 54px; color: #94a3b8; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0; }
    .sch-tag-col { width: 54px; display: flex; align-items: center; justify-content: center; padding: 0; }
    .sch-vs-container { flex: 1; display: flex; align-items: stretch; justify-content: center; }
    .sch-tag-col .sch-pill { font-size: 12px; }
    .sch-live-score { color: #10b981; font-size: 13px; }
    .sch-fin-score { color: #334155; font-size: 13px; }
    .sch-empty { margin-top: 40px; text-align: center; color: #94a3b8; background: #fff; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 600; }
    .arch-empty-msg { text-align: center; padding: 40px; color: #94a3b8; font-weight: 600; }
    .arch-error-msg { padding: 20px; color: #dc2626; text-align: center; font-weight: 600; }

    .league-summary { font-size:12px; color:#64748b; font-weight: 600; background:#f8fafc; padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0; display:inline-flex; align-items:center; white-space:nowrap; }
    .summary-sep { opacity:0.3; margin:0 8px; font-weight:400; }
    .title-right-area { display:flex; align-items:center; gap:12px; }

    @media (max-width: 1100px) { .sch-container { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 650px) {
        .table-title, summary.arch-sum { flex-wrap: wrap; gap: 0; padding: 12px 15px 0 15px; }
        summary.arch-sum { display: flex; flex-direction: column; align-items: flex-start; padding: 0; }
        .table-title { display: flex; flex-direction: column; align-items: flex-start; padding: 0; background: #fff; border-bottom: none; width: 100%; border-radius: 12px 12px 0 0; }
        .table-title > div:first-child { width: 100%; padding: 8px 15px; display: flex; align-items: flex-start; flex: 1 1 0; gap: 6px; min-width: 0; }
        .table-title > div:first-child .league-title-text { white-space: normal; line-height: 1.4; word-break: break-word; }
        .table-title .title-right-area { margin-top: 0 !important; padding: 8px 15px !important; align-items: center; display: flex; flex: 1 1 0; justify-content: flex-end !important; }
        .arch-title-wrapper { width: 100%; padding: 8px 15px; display: flex; align-items: center; column-gap: 10px; flex: 1 1 0; }
        summary.arch-sum .title-right-area { margin-top: 0 !important; padding: 8px 15px !important; align-items: center; flex: 1 1 0; }
        .arch-indicator { margin-right: 0; }
        .arch-title-wrapper a { white-space: normal; line-height: 1.3; }
        .title-right-area { width: 100%; justify-content: flex-end !important; padding: 10px 15px 12px 15px; border-top: 1px dashed #e2e8f0; margin-top: 8px; display: flex; }
        .league-summary { font-size: 11px; padding: 3px 8px; }
        details.home-sec > summary.table-title { min-height: 72px; background: linear-gradient(135deg, #f8fafc 0%, #fff 100%); }
        .table-title .league-jump-btn svg { width: 13px; height: 13px; }
    }
    @media (max-width: 650px) { .sch-container { grid-template-columns: 1fr; } }

    @keyframes modalShow { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.98); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    .modal { display: none; position: fixed; z-index: 999; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background-color: rgba(15, 23, 42, 0.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
    .modal-content { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #ffffff; margin: 0; padding: 0; border: 1px solid #e2e8f0; width: 90%; max-width: 420px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: modalShow 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; display: flex; flex-direction: column; max-height: 80vh; }
    #modalTitle { margin: 0; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; font-size: 18px; font-weight: 600; color: #0f172a; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; background: #f8fafc; border-radius: 16px 16px 0 0; flex-shrink: 0; }
    .match-list { margin: 0; padding: 16px 24px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; flex: 1; }
    .match-list::-webkit-scrollbar { width: 6px; }
    .match-list::-webkit-scrollbar-track { background: transparent; }
    .match-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
    .match-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
    .match-item { display: flex; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; margin-bottom: 12px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: all 0.2s ease; min-height: 48px; }
    .match-item.match-win { border-color: #10b981; }
    .match-item.match-loss { border-color: #ef4444; }
    .match-item:last-child { margin-bottom: 0; }
    .col-date { width: 60px; flex-shrink: 0; font-size: 13px; color: #64748b; font-weight: 600; font-variant-numeric: tabular-nums; text-align: center; line-height: 1.4; white-space: nowrap; }
    .col-res { width: 44px; flex-shrink: 0; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; }
    .col-res .hist-icon { font-size: 18px; }
    .col-vs-area { flex: 1; min-width: 0; }
    .modal-divider { width: 1px; height: 28px; background: #e2e8f0; flex-shrink: 0; margin: 0 16px; }
    .sch-pill { padding: 2px 6px; border-radius: 4px; font-size: 13px; font-weight: 600; background: #dbeafe; color: #1d4ed8; display: inline-block; line-height: normal; }
    .sch-pill.gold { background: #f2d49c; color: #9c5326; }
    .score-box { display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 0; min-height: 28px; min-width: 48px; transition: 0.2s; }
    .score-box.is-full { background: #fff7ed; border-color: #fdba74; box-shadow: inset 0 0 0 1px #fdba74; }
    .score-box.is-full .score-text { color: #c2410c; }
    .score-text { font-weight: 600; font-size: 15px; color: #1e293b; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
    .score-text.live { color: #10b981; }
    .score-text.vs { color: #94a3b8; font-size: 10px; letter-spacing: 0; font-weight: 600; }
    @media (max-width: 650px) { .match-item { padding: 10px 8px; } .col-date { width: 48px; font-size: 12px; } .modal-divider { margin: 0 6px; } .col-res { width: 48px; font-size: 18px; } .col-res .hist-icon { font-size: 18px; } .score-box { min-width: 48px; } .spine-l { padding-right: 2px; } .spine-r { padding-left: 2px; } }
`;

// 页脚样式
export const BUILD_FOOTER_STYLE = `
    .build-footer { margin-top: auto; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; }

    .build-footer .footer-label { font-weight: 500; }
    .build-footer .footer-time, .build-footer .footer-sha { color: #64748b; font-weight: 600; }
    .build-footer a { color: inherit; text-decoration: none; opacity: 1; transition: filter 0.2s ease; }
    .build-footer a:hover { filter: brightness(1.08); text-decoration: underline; }
`;

// 工具页面样式
export const TOOLS_PAGE_STYLE = `
    ${COMMON_STYLE}
    body { min-height: 100dvh; display: flex; flex-direction: column; margin: 0; }
    .container { flex: 1; max-width: 900px; display: flex; flex-direction: column; gap: 20px; }

    .wrapper { width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; box-sizing: border-box; }
    .table-title { padding: 15px 20px; font-weight: 600; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; background: #fff; color: #0f172a; font-size: 15px; box-sizing: border-box; }
    .section-body { padding: 25px 20px; box-sizing: border-box; }
    .section-body-compact { padding-top: 20px; padding-bottom: 20px; }

    .flex-row { display: flex; justify-content: space-between; align-items: center; gap: 15px; }
    .tool-info-title { font-weight: 600; color: #0f172a; margin-bottom: 4px; }
    .tool-info-desc { font-size: 13px; color: #64748b; }
    .tool-info-desc-spaced { margin-bottom: 20px; }
    .actions-row-end { display: flex; justify-content: flex-end; }

    .ops-body .list { display: flex; flex-direction: column; gap: 4px; }
    .ops-body .item { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px; transition: 0.2s; border: 1px solid transparent; }
    .ops-body .item:hover { background: #f8fafc; border-color: #e2e8f0; }
    .ops-body .item-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer; }
    .ops-body .item-chk { width: 16px; height: 16px; accent-color: #2563eb; flex-shrink: 0; }
    .ops-body .item-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ops-body .item-right { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }
    .ops-body .group-header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 6px 12px; }
    .ops-body .group-chk { width: 16px; height: 16px; accent-color: #2563eb; flex-shrink: 0; cursor: pointer; }
    .ops-body .group-label { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
    .ops-body .item-sep { height: 1px; background: #f1f5f9; margin: 4px 0; }
    .ops-body .ops-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px; }
    .ops-body .icon-btn { background: none; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; cursor: pointer; font-size: 14px; transition: 0.2s; }
    .ops-body .icon-btn:hover { background: #f1f5f9; border-color: #cbd5e1; }
    .ops-body .icon-btn-fill { color: #2563eb; }
    .ops-body .icon-btn-fill:hover { background: #eff6ff; border-color: #93c5fd; }
    .ops-body .icon-btn-del { color: #dc2626; }
    .ops-body .icon-btn-del:hover { background: #fef2f2; border-color: #fca5a5; }

    .primary-btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; transition: 0.2s; margin: 0; white-space: nowrap; }
    .primary-btn:hover { background: #1d4ed8; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
    .form-group { display: flex; flex-direction: column; }
    .tool-label { font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px; padding-left: 2px; }
    .form-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; color: #0f172a; box-sizing: border-box; transition: all 0.2s; background: #f8fafc; }
    .form-input:focus { background: #fff; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); outline: none; }
    .form-input::placeholder { color: #94a3b8; }

    /* 修改后的代码：使用 Grid 布局实现一行两个 */
    .qr-list-container { max-height: 250px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; margin-bottom: 15px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .qr-item { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; }
    .qr-label { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 6px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; background: transparent; flex: 1; min-width: 0; }
    .qr-label:hover { background: #fff; border-color: #cbd5e1; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .form-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #2563eb; margin: 0; flex-shrink: 0; }
    .qr-name { font-weight: 600; color: #1e293b; font-size: 14px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qr-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .fill-btn { background: #fff; color: #2563eb; border: 1px solid #bfdbfe; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; margin: 0; flex-shrink: 0; }
    .fill-btn:hover { background: #eff6ff; border-color: #93c5fd; }
    .delete-btn { background: #fff; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; margin: 0; flex-shrink: 0; }
    .delete-btn:hover { background: #fef2f2; border-color: #fca5a5; }
    .secondary-btn { background: #fff; color: #475569; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; transition: 0.2s; margin: 0; white-space: nowrap; }
    .secondary-btn:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
    .mode-select { width: auto; min-width: 80px; padding: 6px 28px 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; color: #0f172a; background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 8px center; -webkit-appearance: none; appearance: none; cursor: pointer; flex-shrink: 0; }
    .mode-select:focus { border-color: #2563eb; outline: none; }

    @media (max-width: 650px) { .form-grid { grid-template-columns: 1fr; gap: 12px; } .flex-row { flex-direction: column; align-items: stretch; text-align: left; } .primary-btn, .secondary-btn { width: 100%; } .actions-row-end { flex-direction: column; } .qr-list-container { grid-template-columns: 1fr; } .ops-actions { flex-direction: column; } .ops-body .item { flex-wrap: wrap; } .ops-body .item-right { width: 100%; justify-content: flex-end; margin-top: 4px; } }

    ${BUILD_FOOTER_STYLE}

    /* Clean Glass Auth Overlay */
    #auth-overlay { position: fixed; inset: 0; background: rgba(241,245,249,0.8); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 999; }
    .auth-card { background: #fff; padding: 35px 30px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); width: 340px; text-align: center; box-sizing: border-box; border: 1px solid #e2e8f0; }
    .auth-icon { font-size: 32px; margin-bottom: 20px; }
    .auth-btn { width: 100%; justify-content: center; padding: 12px; font-size: 14px; }
    .auth-input { text-align: center; letter-spacing: 2px; margin-bottom: 20px; padding: 12px; }

    /* Toast 通知 */
    #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; width: auto; max-width: 92vw; }
    .toast { display: inline-flex; align-items: center; width: fit-content; max-width: min(92vw, 460px); color: #1e293b; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid #d9ecff; padding: 11px 14px; border-radius: 14px; font-size: 13px; line-height: 1.45; font-weight: 600; letter-spacing: 0.1px; box-shadow: 0 12px 28px -18px rgba(14,116,144,0.45), 0 3px 10px rgba(148,163,184,0.18); opacity: 0; transform: translateY(-10px) scale(0.985); transition: opacity 0.22s ease, transform 0.22s ease, box-shadow 0.22s ease; text-align: left; word-break: break-word; }
    .toast.show { opacity: 1; transform: translateY(0) scale(1); box-shadow: 0 14px 30px -18px rgba(14,116,144,0.5), 0 4px 12px rgba(148,163,184,0.2); }
    .toast.success { background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%); border-color: #86efac; color: #166534; }
    .toast.error { background: linear-gradient(180deg, #fff7ed 0%, #fff1f2 100%); border-color: #fdba74; color: #9a3412; }
`;

// 日志页面样式
export const LOG_PAGE_STYLE = `
    ${COMMON_STYLE}
    body { min-height: 100vh; min-height: 100dvh; background: #f1f5f9; }
    .logs-cards-container { max-width: 1000px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .league-card { --card-x-pad: 16px; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.05); overflow: hidden; height: 300px; display: flex; flex-direction: column; }
    .league-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; }
    .league-card-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .league-card-name { font-weight: 600; font-size: 16px; color: #0f172a; }
    .league-total-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 22px; padding: 0 8px; border-radius: 999px; background: #e2e8f0; color: #334155; font-size: 12px; font-weight: 700; line-height: 1; }
    .league-card-status { display: flex; align-items: center; gap: 6px; }
    .mode-tag { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .mode-fast { background: #dbeafe; color: #1d4ed8; }
    .mode-slow { background: #f2d49c; color: #9c5326; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .dot-green { background: #22c55e; }
    .dot-red { background: #ef4444; }
    .dot-gray { background: #cbd5e1; }
    .card-stats { display: flex; gap: 16px; padding: 8px var(--card-x-pad); font-size: 12px; color: #94a3b8; border-bottom: 1px solid #f8fafc; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .stat-val { color: #0f172a; font-weight: 600; }
    .timeline { display: flex; gap: 2px; height: 16px; align-items: flex-end; padding: 6px 16px 0 16px; border-bottom: 1px solid #f8fafc; }
    .bar { flex: 1; border-radius: 2px 2px 0 0; min-width: 3px; }
    .bar-sync { background: #22c55e; }
    .bar-idle { background: #e2e8f0; }
    .bar-err { background: #ef4444; }
    .league-card-logs { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; }
    .league-card-logs::-webkit-scrollbar { display: none; }
    .log-mini-row { display: flex; align-items: baseline; gap: 16px; padding: 6px var(--card-x-pad); border-bottom: 1px solid #f8fafc; font-size: 13px; }
    .log-mini-row:last-child { border-bottom: none; }
    .log-mini-time { color: #94a3b8; font-size: 12px; white-space: nowrap; flex-shrink: 0; min-width: 95px; font-weight: 500; }
    .log-mini-msg { color: #64748b; word-break: break-all; line-height: 1.4; font-size: 13px; font-weight: 500; }
    .log-mini-msg .hl { color: #0f172a; font-weight: 600; }
    .empty-logs { padding: 40px; text-align: center; color: #94a3b8; font-style: italic; grid-column: 1 / -1; }
    ${BUILD_FOOTER_STYLE}

    @media (max-width: 650px) {
        .logs-cards-container { grid-template-columns: 1fr; }
        .league-card { --card-x-pad: 16px; }
        .league-card-header { padding: 10px 16px; }
        .log-mini-row { flex-direction: column; align-items: flex-start; gap: 2px; }
        .log-mini-time { min-width: auto; font-size: 11px; line-height: 1.2; }
        .log-mini-msg { width: 100%; word-break: break-word; line-height: 1.35; text-align: left; }
    }
`;
