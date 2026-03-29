import { HTMLRenderer } from '../render/htmlRenderer.js';
import { Analyzer } from '../core/analyzer.js';
import { Updater } from '../core/updater.js';
import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { dataUtils } from '../utils/dataUtils.js';
import { KV_KEYS } from '../utils/constants.js';

/**
 * API路由处理
 */
export class APIRouter {
  /**
   * 处理备份请求
   */
  static async handleBackup(request, env) {
    const payload = {};
    const allHomeKeys = await env.LOL_KV.list({ prefix: "HOME_" });
    const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== KV_KEYS.HOME_STATIC_HTML);
    const rawHomes = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k, { type: "json" })));
      rawHomes.forEach(home => {
        if (home && home.tourn && home.stats) {
          const slug = home.tourn.slug;
          payload[`markdown/${slug}.md`] = HTMLRenderer.generateMarkdown(
            home.tourn,
            home.stats,
            { [slug]: home.timeGrid || {} }
          );
        }
      });
    if (Object.keys(payload).length === 0) {
      return new Response(JSON.stringify({ error: "No data" }), { 
        status: 503, 
        headers: { "content-type": "application/json" } 
      });
    }
    return new Response(JSON.stringify(payload), { 
      headers: { "content-type": "application/json" } 
    });
  }

  /**
   * 处理强制更新请求
   */
  static async handleForceUpdate(request, env) {
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    try {
      let forceSlugs = null;
      try {
        const body = await request.clone().json();
        if (body && Array.isArray(body.slugs) && body.slugs.length > 0) {
          forceSlugs = new Set(body.slugs);
        }
      } catch (e) {}

      const updater = new Updater(env);
      await updater.runUpdate(true, forceSlugs);
      
      return new Response("OK", { status: 200 });
    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 处理刷新UI请求
   */
  static async handleRefreshUI(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const allHomeKeys = await env.LOL_KV.list({ prefix: "HOME_" });
      const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== KV_KEYS.HOME_STATIC_HTML);
      const rawHomes = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k, { type: "json" })));
      const homeEntries = rawHomes.filter(h => h && h.tourn);

      // 排序锦标赛
      const sortedTourns = homeEntries.map(h => h.tourn).sort((matchA, matchB) => {
        const aStart = matchA.start_date || '';
        const bStart = matchB.start_date || '';
        const aEnd = matchA.end_date || '';
        const bEnd = matchB.end_date || '';
        if (aStart !== bStart) {
          if (!aStart) return 1;
          if (!bStart) return -1;
          return bStart.localeCompare(aStart);
        }
        if (aEnd !== bEnd) {
          if (!aEnd) return 1;
          if (!bEnd) return -1;
          return bEnd.localeCompare(aEnd);
        }
          return (matchA.slug || '').localeCompare(matchB.slug || '');
      });
      const runtimeConfig = { TOURNAMENTS: sortedTourns };

      const globalStats = {};
      const timeGrid = {};
      const scheduleMap = {};
      const tournMeta = {};
      homeEntries.forEach(home => {
        if (home && home.tourn && home.stats) {
          const slug = home.tourn.slug;
          if (home.stats) globalStats[slug] = home.stats;
          if (home.timeGrid) timeGrid[slug] = home.timeGrid;
          if (home.tournMeta && home.tournMeta[slug]) {
            tournMeta[slug] = home.tournMeta[slug];
          }
        }
        const sch = home.scheduleMap || {};
        Object.keys(sch).forEach(date => {
          if (!scheduleMap[date]) scheduleMap[date] = [];
          scheduleMap[date].push(...sch[date]);
        });
      });
      Object.keys(scheduleMap).forEach(date => {
        scheduleMap[date].sort((matchA, matchB) => {
          if (matchA.tournIndex !== matchB.tournIndex) return matchA.tournIndex - matchB.tournIndex;
          return matchA.time.localeCompare(matchB.time);
        });
      });

      if (Object.keys(globalStats).length === 0) {
        return new Response("No cache data available. Run Refresh API first.", { status: 400 });
      }

      // 生成HTML
      const homeFragment = HTMLRenderer.renderContentOnly(
        globalStats, timeGrid, scheduleMap,
        runtimeConfig || { TOURNAMENTS: [] },
        false, tournMeta
      );
      const fullPage = HTMLRenderer.renderPageShell("LoL Insights", homeFragment, "home");
      const existingHomeHTML = await env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
      const writePromises = [];
      let homeChanged = false;
      if (existingHomeHTML !== fullPage) {
        writePromises.push(env.LOL_KV.put(KV_KEYS.HOME_STATIC_HTML, fullPage));
        homeChanged = true;
      }

      // 生成归档HTML
      const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
      const existingArchiveHTML = await env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
      let archiveChanged = false;
      if (existingArchiveHTML !== archiveHTML) {
        writePromises.push(env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML));
        archiveChanged = true;
      }

      await Promise.all(writePromises);

      return new Response(
        `OK homes=${homeEntries.length} writes=${writePromises.length} home=${homeChanged?"updated":"same"} archive=${archiveChanged?"updated":"same"}`,
        { status: 200 }
      );
    } catch (err) {
      return new Response(`Render Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 处理重建归档请求
   */
  static async handleRebuildArchive(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    if (!payload.slug || !payload.name || !payload.overview_page || !payload.league) {
      return new Response("Missing required fields. Please provide slug, name, overview_page, and league.", { status: 400 });
    }

    try {
      const logger = { logs: [], error(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'ERROR', m: message}); }, success(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'SUCCESS', m: message}); } };
      
      const authContext = await FandomClient.login(env.FANDOM_USER, env.FANDOM_PASS);
      const fandomClient = new FandomClient(authContext);

      let teamsRaw = null;
      try {
        const githubClient = new GitHubClient(env);
        teamsRaw = await githubClient.fetchJson("config/teams.json");
      } catch (e) {}

      // 支持 overview_page 为数组或字符串
      const overviewPages = Array.isArray(payload.overview_page) ? payload.overview_page : [payload.overview_page];
      const matches = await fandomClient.fetchAllMatches(payload.slug, overviewPages, null);

      if (matches && matches.length > 0) {
        const tournament = {
          slug: payload.slug,
          name: payload.name,
          overview_page: overviewPages,
          league: payload.league,
          start_date: payload.start_date || null,
          end_date: payload.end_date || null
        };
        const teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, matches);

        const snapshot = {
          tourn: tournament,
          rawMatches: matches,
          updateTimestamps: { [payload.slug]: Date.now() },
          team_map: teamMap
        };

        await env.LOL_KV.put(`ARCHIVE_${payload.slug}`, JSON.stringify(snapshot));
        logger.success(`🟢 [SYNC] | 🔄 ${payload.name} *${matches.length} | ⚙️ Rebuild Archive`);

        const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
        const existingArchiveHTML = await env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
        if (existingArchiveHTML !== archiveHTML) {
          await env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
        }
      } else {
        logger.error(`🔴 [ERR!] | 🚧 ${payload.name}(Drop) | ❌ No matches found for rebuild`);
        throw new Error("No matches found from Fandom API");
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      logger.error(`🔴 [ERR!] | ❌ ${payload.name}(Fail) | ${err.message}`);
      
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 处理删除归档请求
   */
  static async handleDeleteArchive(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    if (!payload.slug || !payload.name) {
      return new Response("Missing required fields: slug, name", { status: 400 });
    }

    try {
      const logger = { logs: [], error(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'ERROR', m: message}); }, success(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'SUCCESS', m: message}); } };
      
      await env.LOL_KV.delete(`ARCHIVE_${payload.slug}`);

      // 重新生成 archive HTML
      const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
      const existingArchiveHTML = await env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
      if (existingArchiveHTML !== archiveHTML) {
        await env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
      }

      logger.success(`🗑️ [DELETE] | 📦 ${payload.name}`);

      return new Response("OK", { status: 200 });
    } catch (err) {
      return new Response(`Delete Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 处理手动归档请求
   */
  static async handleManualArchive(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    if (!payload.slug || !payload.name || !payload.overview_page || !payload.league) {
      return new Response("Missing required fields. Please provide slug, name, overview_page, and league.", { status: 400 });
    }

    try {
      const logger = { logs: [], error(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'ERROR', m: message}); }, success(message) { this.logs.push({t: new Date().toISOString().slice(2, 19), l: 'SUCCESS', m: message}); } };
      
      let teamsRaw = null;
      try {
        const githubClient = new GitHubClient(env);
        teamsRaw = await githubClient.fetchJson("config/teams.json");
      } catch (e) {}

      // 处理 overview_page：支持逗号分隔或 JSON 数组格式
      let overviewPages = payload.overview_page;
      if (typeof overviewPages === 'string') {
        const trimmed = overviewPages.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            overviewPages = JSON.parse(trimmed);
          } catch (e) {
            overviewPages = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
          }
        } else {
          overviewPages = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
      } else if (!Array.isArray(overviewPages)) {
        overviewPages = [overviewPages];
      }

      // 创建空的存档（仅元数据，无比赛数据）
      const snapshot = {
        tourn: {
          slug: payload.slug,
          name: payload.name,
          overview_page: overviewPages,
          league: payload.league,
          start_date: payload.start_date || null,
          end_date: payload.end_date || null
        },
        rawMatches: [], // 空数据
        updateTimestamps: { [payload.slug]: Date.now() },
        team_map: dataUtils.pickTeamMap(teamsRaw, { slug: payload.slug, league: payload.league }, [])
      };

      await env.LOL_KV.put(`ARCHIVE_${payload.slug}`, JSON.stringify(snapshot));

      // 重新生成 archive HTML
      const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
      const existingArchiveHTML = await env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
      if (existingArchiveHTML !== archiveHTML) {
        await env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
      }

      logger.success(`📦 [MANUAL] | 📝 ${payload.name}`);

      return new Response("OK", { status: 200 });
    } catch (err) {
      return new Response(`Save Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 检查是否未授权
   */
  static isUnauthorized(request, env) {
    const expectedSecret = env.ADMIN_SECRET;
    const authHeader = request.headers.get("Authorization");
    return Boolean(expectedSecret && (!authHeader || authHeader !== `Bearer ${expectedSecret}`));
  }

  /**
   * 获取模式覆盖配置
   */
  static async handleGetModeOverrides(request, env) {
    try {
      const allHomeKeys = await env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
      const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== KV_KEYS.HOME_STATIC_HTML);
      const rawHomes = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k, { type: "json" })));

      const overrides = {};
      const tournaments = rawHomes
        .filter(h => h && h.tourn)
        .map(h => {
          const slug = h.tourn.slug;
          const meta = h.tournMeta?.[slug] || {};
          const currentMode = meta.mode || "fast";
          const modeOverride = meta.modeOverride || "auto";
          overrides[slug] = modeOverride;
          return {
            slug,
            name: h.tourn.name,
            league: h.tourn.league,
            currentMode,
            override: modeOverride
          };
        });

      return new Response(JSON.stringify({ overrides, tournaments }), {
        headers: { "content-type": "application/json" }
      });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 设置模式覆盖配置
   */
  static async handleSetModeOverrides(request, env) {
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const body = await request.json();
      if (!body || typeof body !== "object") {
        return new Response("Invalid JSON payload", { status: 400 });
      }

      const validModes = ["auto", "fast", "slow"];
      const cleanOverrides = {};
      for (const [slug, mode] of Object.entries(body)) {
        if (typeof slug === "string" && validModes.includes(mode)) {
          cleanOverrides[slug] = mode;
        }
      }

      // 写入每个 HOME_${slug}.tournMeta.modeOverride
      const writePromises = [];
      for (const [slug, mode] of Object.entries(cleanOverrides)) {
        const homeKey = KV_KEYS.HOME_PREFIX + slug;
        const home = await env.LOL_KV.get(homeKey, { type: "json" });
        if (home) {
          if (!home.tournMeta) home.tournMeta = {};
          if (!home.tournMeta[slug]) home.tournMeta[slug] = {};
          if (mode === "auto") {
            delete home.tournMeta[slug].modeOverride;
          } else {
            home.tournMeta[slug].modeOverride = mode;
          }
          writePromises.push(env.LOL_KV.put(homeKey, JSON.stringify(home)));
        }
      }
      await Promise.all(writePromises);

      return new Response(JSON.stringify({ success: true, overrides: cleanOverrides }), {
        headers: { "content-type": "application/json" }
      });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }

  /**
   * 生成归档静态HTML
   */
  static async generateArchiveStaticHTML(env) {
    try {
      const allKeys = await env.LOL_KV.list({ prefix: "ARCHIVE_" });
      const dataKeys = allKeys.keys.filter(k => k.name !== KV_KEYS.ARCHIVE_STATIC_HTML);

      if (!dataKeys.length) {
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
      }

      const rawSnapshots = await Promise.all(dataKeys.map(k => env.LOL_KV.get(k.name, { type: "json" })));
      let validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

      validSnapshots = dataUtils.sortTournamentsByDate(validSnapshots);

      const combined = validSnapshots.map(snap => {
        const tournamentWithMap = { ...snap.tourn, team_map: snap.team_map || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snap.tourn.slug] || {};
        const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
        return HTMLRenderer.renderContentOnly(
          { [snap.tourn.slug]: statsObj },
          { [snap.tourn.slug]: timeObj },
          {}, miniConfig, true
        );
      }).join("");

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (e) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${e.message}</div>`, "archive");
    }
  }
}