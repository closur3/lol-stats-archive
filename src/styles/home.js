export default `* { box-sizing: border-box; margin: 0; padding: 0; }
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
