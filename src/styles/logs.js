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
    
    .build-footer { margin-top: auto; text-align: center; padding: 15px 20px; padding-bottom: calc(15px + env(safe-area-inset-bottom)); color: #94a3b8; font-size: 11px; }

    .build-footer .footer-label { font-weight: 500; }
    .build-footer .footer-time, .build-footer .footer-sha { color: #64748b; font-weight: 600; }
    .build-footer a { color: inherit; text-decoration: none; opacity: 1; transition: filter 0.2s ease; }
    .build-footer a:hover { filter: brightness(1.08); text-decoration: underline; }


    @media (max-width: 650px) {
        .logs-cards-container { grid-template-columns: 1fr; }
        .league-card { --card-x-pad: 16px; }
        .league-card-header { padding: 10px 16px; }
        .log-mini-row { flex-direction: column; align-items: flex-start; gap: 2px; }
        .log-mini-time { min-width: auto; font-size: 11px; line-height: 1.2; }
        .log-mini-msg { width: 100%; word-break: break-word; line-height: 1.35; text-align: left; }
    }
`;
