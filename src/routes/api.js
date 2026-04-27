import { HTMLRenderer } from '../render/htmlRenderer.js';
import { Updater } from '../core/updater.js';
import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { dataUtils } from '../utils/dataUtils.js';
import { kvKeys } from '../infrastructure/kv/keyFactory.js';
import { kvDelete, kvPutIfChanged } from '../utils/kvStore.js';

/**
 * API路由处理
 */
export class APIRouter {
  /**
   * 处理备份请求
   */
  static async handleBackup(request, env) {
    if (APIRouter.isUnauthorized(request, env)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = {};
    const kv = env["lol-stats-kv"];
    const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
    const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== kvKeys.homeStatic());
    const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));
      rawHomes.forEach(home => {
        const homeTournament = home?.tournament;
        if (home && homeTournament && home.stats) {
          const slug = homeTournament.slug;
          payload[`markdown/${slug}.md`] = HTMLRenderer.generateMarkdown(
            homeTournament,
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
        const body = await request.json();
        if (!body || !Array.isArray(body.slugs)) {
          return new Response("Missing required field: slugs[]", { status: 400 });
        }
        const cleanSlugs = body.slugs
          .filter(slug => typeof slug === "string")
          .map(slug => slug.trim())
          .filter(Boolean);
        if (cleanSlugs.length === 0) {
          return new Response("Missing required field: slugs[]", { status: 400 });
        }
        forceSlugs = new Set(cleanSlugs);
      } catch (_error) {
        return new Response("Invalid JSON payload", { status: 400 });
      }

      const updater = new Updater(env);
      let runtimeConfig;
      try {
        runtimeConfig = await updater.loadRuntimeConfig();
      } catch (_error) {
        return new Response("Config load failed", { status: 500 });
      }
      const cache = await updater.loadCachedData(runtimeConfig.TOURNAMENTS);
      await updater.runFandomUpdate(runtimeConfig, cache, true, forceSlugs);
      
      return new Response("OK", { status: 200 });
    } catch (error) {
      return new Response(`Worker Error: ${error.message}`, { status: 500 });
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

    const result = await APIRouter.rebuildStaticPagesFromCache(env);
    if (!result.ok) {
      const status = result.reason === "NO_CACHE" ? 400 : 500;
      return new Response(result.message, { status });
    }

    return new Response(
      `OK homes=${result.homes} writes=${result.writes} home=${result.homeChanged ? "updated" : "same"} archive=${result.archiveChanged ? "updated" : "same"}`,
      { status: 200 }
    );
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
    } catch (_error) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const league = typeof payload.league === "string" ? payload.league.trim() : "";
    const startDate = typeof payload.start_date === "string" ? payload.start_date.trim() : "";
    const endDate = typeof payload.end_date === "string" ? payload.end_date.trim() : "";
    const hasOverviewPage = Array.isArray(payload.overview_page)
      ? payload.overview_page.some(page => typeof page === "string" && page.trim().length > 0)
      : (typeof payload.overview_page === "string" && payload.overview_page.trim().length > 0);

    if (!slug || !name || !league || !startDate || !endDate || !hasOverviewPage) {
      return new Response("Missing required fields. Please provide slug, name, overview_page, league, start_date, and end_date.", { status: 400 });
    }

    try {
      const authContext = await FandomClient.login(env.FANDOM_USER, env.FANDOM_PASS);
      const fandomClient = new FandomClient(authContext);

      let teamsRaw = null;
      try {
        const githubClient = new GitHubClient(env);
        teamsRaw = await githubClient.fetchJson("config/teams.json");
      } catch (error) { console.error("[Rebuild] Failed to load teams.json:", error.message); }

      // 支持 overview_page 为数组或字符串
      const overviewPages = (Array.isArray(payload.overview_page) ? payload.overview_page : [payload.overview_page])
        .map(page => typeof page === "string" ? page.trim() : "")
        .filter(Boolean);
      const matches = await fandomClient.fetchAllMatches(slug, overviewPages, null);

      if (matches && matches.length > 0) {
        const tournament = {
          slug: slug,
          name: name,
          overview_page: overviewPages,
          league: league,
          start_date: startDate,
          end_date: endDate
        };
        const teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, matches);

        const snapshot = {
          tournament,
          rawMatches: matches,
          teamMap: teamMap
        };

        await kvPutIfChanged(env, kvKeys.archive(slug), snapshot);

        const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
        await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
      } else {
        throw new Error("No matches found from Fandom API");
      }

      return new Response("OK", { status: 200 });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
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
    } catch (_error) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    if (!payload.slug || !payload.name) {
      return new Response("Missing required fields: slug, name", { status: 400 });
    }

    try {
      await kvDelete(env, kvKeys.archive(payload.slug));

      const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
      await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);

      return new Response("OK", { status: 200 });
    } catch (error) {
      return new Response(`Delete Error: ${error.message}`, { status: 500 });
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
    } catch (_error) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const league = typeof payload.league === "string" ? payload.league.trim() : "";
    const startDate = typeof payload.start_date === "string" ? payload.start_date.trim() : "";
    const endDate = typeof payload.end_date === "string" ? payload.end_date.trim() : "";
    const hasOverviewPage = Array.isArray(payload.overview_page)
      ? payload.overview_page.some(page => typeof page === "string" && page.trim().length > 0)
      : (typeof payload.overview_page === "string" && payload.overview_page.trim().length > 0);

    if (!slug || !name || !league || !startDate || !endDate || !hasOverviewPage) {
      return new Response("Missing required fields. Please provide slug, name, overview_page, league, start_date, and end_date.", { status: 400 });
    }

    try {
      // 处理 overview_page：支持逗号分隔或 JSON 数组格式
      let overviewPages = payload.overview_page;
      if (typeof overviewPages === 'string') {
        const trimmed = overviewPages.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            overviewPages = JSON.parse(trimmed);
          } catch (_error) {
            overviewPages = trimmed.split(',').map(page => page.trim()).filter(page => page.length > 0);
          }
        } else {
          overviewPages = trimmed.split(',').map(page => page.trim()).filter(page => page.length > 0);
        }
      } else if (!Array.isArray(overviewPages)) {
        overviewPages = [overviewPages];
      }
      overviewPages = overviewPages
        .map(page => typeof page === "string" ? page.trim() : "")
        .filter(Boolean);

      // 创建空的存档（仅元数据，无比赛数据）
      const snapshot = {
        tournament: {
          slug: slug,
          name: name,
          overview_page: overviewPages,
          league: league,
          start_date: startDate,
          end_date: endDate
        },
        rawMatches: [],
        teamMap: {}
      };

      await kvPutIfChanged(env, kvKeys.archive(slug), snapshot);

      const archiveHTML = await APIRouter.generateArchiveStaticHTML(env);
      await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);

      return new Response("OK", { status: 200 });
    } catch (error) {
      return new Response(`Save Error: ${error.message}`, { status: 500 });
    }
  }

  /**
   * 检查是否未授权
   */
  static isUnauthorized(request, env) {
    const expectedSecret = env.ADMIN_SECRET;
    // 如果未配置 ADMIN_SECRET，拒绝所有请求（安全优先）
    if (!expectedSecret) return true;
    const authHeader = request.headers.get("Authorization");
    return !authHeader || authHeader !== `Bearer ${expectedSecret}`;
  }

  /**
   * 从已有缓存重建静态页面
   */
  static async rebuildStaticPagesFromCache(env) {
    try {
      const updater = new Updater(env);
      return await updater.rebuildStaticPagesFromCache({ includeArchive: true, requireData: true });
    } catch (error) {
      return { ok: false, reason: "ERROR", message: `Render Error: ${error.message}` };
    }
  }

  /**
   * 生成归档静态HTML
   */
  static async generateArchiveStaticHTML(env) {
    const updater = new Updater(env);
    return updater.generateArchiveStaticHTML();
  }
}
