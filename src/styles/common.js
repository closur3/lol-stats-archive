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
`;
