import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { Analyzer } from './analyzer.js';
import { HTMLRenderer } from '../render/htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { KV_KEYS } from '../utils/constants.js';

/**
 * 更新管理器
 */
export class Updater {
  constructor(env) {
    this.env = env;
    this.githubClient = new GitHubClient(env);
    this.logger = new Logger();
  }

  getSlowThresholdMs() {
    const mins = Number(this.env.SLOW_THRESHOLD_MINUTES);
    if (!Number.isFinite(mins) || mins <= 0) return 120 * 60 * 1000;
    return Math.round(mins * 60 * 1000);
  }

  getCronIntervalMinutes() {
    const mins = Number(this.env.CRON_INTERVAL_MINUTES);
    if (!Number.isFinite(mins) || mins <= 0) return 3;
    return Math.round(mins);
  }

  getUpdateRounds() {
    const rounds = Number(this.env.UPDATE_ROUNDS);
    if (!Number.isFinite(rounds) || rounds <= 0) return 1;
    return Math.floor(rounds);
  }

  getMaxScheduleDays() {
    const days = Number(this.env.MAX_SCHEDULE_DAYS);
    if (!Number.isFinite(days) || days <= 0) return 8;
    return Math.floor(days);
  }

  formatDeltaTag(item) {
    const added = Number.isFinite(item?.added) ? item.added : 0;
    const updated = Number.isFinite(item?.updated) ? item.updated : 0;
    if (added > 0 && updated > 0) return `+${added}~${updated}`;
    if (added > 0) return `+${added}`;
    if (updated > 0) return `~${updated}`;
    return "±0";
  }

  /**
   * Cron入口：先做revid轻量检测，再决定是否触发更新
   */
  async runScheduledUpdate() {
    const startedAt = Date.now();
    const runtimeConfig = await this.loadRuntimeConfig();
    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      return this.logger;
    }

    await this.refreshScheduleBoardOnDayRollover(runtimeConfig);

    const NOW = Date.now();
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS || []);
    const { changedSlugs, hasErrors, checkedSlugs, thresholdSkippedSlugs } = await this.detectRevisionChanges(runtimeConfig.TOURNAMENTS || [], cache, NOW);
    console.log(`[CRON] rev-check checked=${checkedSlugs} th-skip=${thresholdSkippedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0} elapsedMs=${Date.now() - startedAt}`);

    if (changedSlugs.size === 0) {
      console.log("[REV-GATE] No revision change, skip cron update");
      console.log("[LOCAL] run (rev unchanged)");
      return this.runLocalUpdate();
    }

    console.log(`[REV-GATE] Changed slugs: ${Array.from(changedSlugs).join(", ")}`);
    return this.runFandomUpdate(false, changedSlugs, {
      bypassThreshold: true,
      forceWrite: false
    });
  }

  /**
   * 每天UTC切日后刷新一次赛程板，确保过期天按新规则清理
   */
  async refreshScheduleBoardOnDayRollover(runtimeConfig) {
    const key = "SCHEDULE_DAY_MARK";
    const today = dateUtils.getNow().date;
    const lastDay = await this.env.LOL_KV.get(key);
    if (lastDay === today) return;

    await this.cleanupStaleHomeKeys(runtimeConfig);
    await this.refreshHomeStaticFromCache();
    await this.env.LOL_KV.put(key, today);
    console.log(`[SCHEDULE] rollover refresh ${lastDay || "none"} -> ${today}`);
  }

  /**
   * 加载运行时配置
   */
  async loadRuntimeConfig() {
    try {
      const tourns = await this.githubClient.fetchJson("config/tour.json");
      if (tourns) return { TOURNAMENTS: tourns };
    } catch (e) {}
    return null;
  }

  /**
   * 比较 overview_page 最新 revision，找出发生编辑的联赛
   */
  async detectRevisionChanges(tournaments, cache, NOW) {
    const changedSlugs = new Set();
    let hasErrors = false;
    let checkedSlugs = 0;
    let thresholdSkippedSlugs = 0;

    for (const tournament of tournaments || []) {
      const slug = tournament?.slug;
      if (!slug) continue;

      const pages = (Array.isArray(tournament.overview_page) ? tournament.overview_page : [tournament.overview_page])
        .filter(p => typeof p === "string")
        .map(p => p.trim())
        .filter(Boolean);

      if (pages.length === 0) continue;
      // revid gate 只看 Data: 页面，避免被 Overview 页面的无关编辑触发
      const dataPages = Array.from(new Set(pages.map(p => p.startsWith("Data:") ? p : `Data:${p}`)));
      const tMetaFromKV = cache?.meta?.tournaments?.[slug];
      const lastTs = cache?.updateTimestamps?.[slug] || 0;
      const revKey = `REV_${slug}`;
      const prev = await this.env.LOL_KV.get(revKey, { type: "json" });
      const lastCheckedAt = Number(prev?.checkedAt) || 0;
      const gateBaseTs = Math.max(lastTs, lastCheckedAt);
      const elapsed = NOW - gateBaseTs;
      let threshold = 0;
      let mode = "fast";

      if (tMetaFromKV) {
        mode = tMetaFromKV.mode || "fast";
        const startTs = tMetaFromKV.startTs || 0;
        const isModeOverride = !!tMetaFromKV.modeOverride;
        const isMatchStarted = startTs > 0 && NOW >= startTs;
        threshold = (mode === "slow" && (isModeOverride || !isMatchStarted)) ? this.getSlowThresholdMs() : 0;
      }

      if (elapsed < threshold) {
        console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> skip`);
        thresholdSkippedSlugs++;
        continue;
      }
      console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> check`);
      checkedSlugs++;

      const prevPages = prev?.pages || {};
      const nextPages = {};
      let slugChanged = false;
      let okCount = 0;
      let errCount = 0;
      const changedPages = [];

      for (const page of dataPages) {
        try {
          const latest = await FandomClient.fetchLatestRevision(page);
          if (latest?.missing) {
            continue;
          }
          const title = latest.title || page;
          okCount++;
          nextPages[title] = {
            revid: latest.revid,
            timestamp: latest.timestamp,
            pageid: latest.pageid
          };

          const prevRev = prevPages?.[title]?.revid;
          if (!prevRev || Number(prevRev) !== Number(latest.revid)) {
            slugChanged = true;
            changedPages.push(`${title}:${prevRev || "none"}->${latest.revid}`);
          }
        } catch (e) {
          errCount++;
          console.log(`[REV] ${slug}: ${page} check failed: ${e.message}`);
        }
      }

      if (errCount > 0 && okCount === 0) hasErrors = true;

      const shouldTrackCheckedAt = mode === "slow";
      const checkedAt = (shouldTrackCheckedAt && okCount > 0) ? NOW : lastCheckedAt;
      const prevNormalized = shouldTrackCheckedAt
        ? { slug, pages: prevPages || {}, checkedAt: lastCheckedAt }
        : { slug, pages: prevPages || {} };
      const nextRecord = shouldTrackCheckedAt
        ? { slug, pages: nextPages || {}, checkedAt }
        : { slug, pages: nextPages || {} };
      const shouldWriteRev = JSON.stringify(prevNormalized) !== JSON.stringify(nextRecord);
      if (shouldWriteRev) {
        await this.env.LOL_KV.put(revKey, JSON.stringify(nextRecord));
      }

      if (slugChanged) {
        changedSlugs.add(slug);
        console.log(`[REV] ${slug}: changed pages=${changedPages.length}${changedPages.length ? ` | ${changedPages.join(", ")}` : ""}`);
      } else if (errCount > 0) {
        console.log(`[REV] ${slug}: partial errors ok=${okCount} err=${errCount}`);
      }
    }

    return { changedSlugs, hasErrors, checkedSlugs, thresholdSkippedSlugs };
  }

  async prepareRuntimeContext() {
    const NOW = Date.now();
    let runtimeConfig = null;
    let teamsRaw = null;
    try {
      teamsRaw = await this.githubClient.fetchJson("config/teams.json");
      runtimeConfig = await this.loadRuntimeConfig();
    } catch (e) {}

    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      return null;
    }

    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    runtimeConfig.TOURNAMENTS = dateUtils.sortTournamentsByDate(runtimeConfig.TOURNAMENTS);
    return { NOW, runtimeConfig, teamsRaw, cache };
  }

  /**
   * 联网更新：查Fandom并写回
   */
  async runFandomUpdate(force = false, forceSlugs = null, options = {}) {
    const bypassThreshold = !!options.bypassThreshold;
    const forceWrite = options.forceWrite === undefined ? force : !!options.forceWrite;
    const isScopedRun = !!(forceSlugs && forceSlugs.size > 0);
    console.log(`[FANDOM] start force=${!!force} scoped=${isScopedRun} slugs=${forceSlugs ? Array.from(forceSlugs).join(",") : "-"}`);
    const updateRounds = this.getUpdateRounds();
    const context = await this.prepareRuntimeContext();
    if (!context) return this.logger;
    const { NOW, runtimeConfig, teamsRaw, cache } = context;

    // 确定需要更新的锦标赛
    const candidates = this.determineCandidates(runtimeConfig.TOURNAMENTS, cache, NOW, force, forceSlugs, bypassThreshold);
    if (candidates.length === 0) {
      console.log(`[SKIP] All tournaments skipped`);
      return this.logger;
    }

    // 登录到Fandom
    const authContext = await FandomClient.login(this.env.FANDOM_USER, this.env.FANDOM_PASS);
    const fandomClient = new FandomClient(authContext);

    // 执行数据抓取
    const results = await this.fetchMatchData(fandomClient, candidates, cache, NOW, updateRounds);

    // 处理结果
    const { failedSlugs, syncItems, idleItems, breakers, apiErrors } = this.processResults(results, cache, NOW, force, runtimeConfig);
    console.log(`[FANDOM] process sync=${syncItems.length} idle=${idleItems.length} breakers=${breakers.length} apiErrors=${apiErrors.length} failed=${failedSlugs.size}`);

    // 为每个锦标赛附加team_map（在数据抓取之后）
    for (const tourn of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tourn.slug] || [];
      tourn.team_map = dataUtils.pickTeamMap(teamsRaw, tourn, rawMatches);
    }

    // 从 tournMeta 中提取 modeOverrides
    const oldTournMeta = cache.meta?.tournaments || {};
    const modeOverrides = {};
    for (const [slug, meta] of Object.entries(oldTournMeta)) {
      if (meta.modeOverride) modeOverrides[slug] = meta.modeOverride;
    }

    const scopedRuntimeConfig = isScopedRun
      ? { TOURNAMENTS: (runtimeConfig.TOURNAMENTS || []).filter(t => forceSlugs.has(t.slug)) }
      : runtimeConfig;

    // 分析数据
    const analysis = Analyzer.runFullAnalysis(cache.rawMatches, oldTournMeta, scopedRuntimeConfig, failedSlugs, modeOverrides, cache.prevScheduleMap, this.getMaxScheduleDays());

    // 生成日志
    this.generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournMeta);
    const leagueLogEntries = this.buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournMeta);

    // 保存数据
    await this.saveData(scopedRuntimeConfig, cache, analysis, syncItems, forceWrite, forceSlugs, leagueLogEntries, isScopedRun, {
      includeArchiveWrites: true
    });

    return this.logger;
  }

  /**
   * 本地更新：不联网，仅基于缓存重算并写入（用于revid未变化场景）
   */
  async runLocalUpdate(forceSlugs = null) {
    const isScopedRun = !!(forceSlugs && forceSlugs.size > 0);

    const context = await this.prepareRuntimeContext();
    if (!context) return this.logger;
    const { runtimeConfig, teamsRaw, cache } = context;

    for (const tourn of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tourn.slug] || [];
      tourn.team_map = dataUtils.pickTeamMap(teamsRaw, tourn, rawMatches);
    }

    const oldTournMeta = cache.meta?.tournaments || {};
    const modeOverrides = {};
    for (const [slug, meta] of Object.entries(oldTournMeta)) {
      if (meta.modeOverride) modeOverrides[slug] = meta.modeOverride;
    }

    const targetTournaments = isScopedRun
      ? (runtimeConfig.TOURNAMENTS || []).filter(t => forceSlugs.has(t.slug))
      : (runtimeConfig.TOURNAMENTS || []);

    const nowTs = Date.now();
    const changedSlugs = [];

    for (const tournament of targetTournaments) {
      const slug = tournament.slug;
      const rawMatches = cache.rawMatches[slug] || [];
      const prevMeta = oldTournMeta[slug] || {};
      const nextMeta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches, nowTs, {
        modeOverride: modeOverrides[slug],
        previousMode: prevMeta.mode || "fast",
        hasFailure: false
      });

      if (JSON.stringify(prevMeta) === JSON.stringify(nextMeta)) continue;

      const homeKey = KV_KEYS.HOME_PREFIX + slug;
      const home = await this.env.LOL_KV.get(homeKey, { type: "json" });
      if (!home || !home.tourn) continue;
      home.tournMeta = { ...(home.tournMeta || {}), [slug]: nextMeta };
      await this.env.LOL_KV.put(homeKey, JSON.stringify(home));
      changedSlugs.push(slug);
    }

    if (changedSlugs.length > 0) {
      console.log(`[LOCAL] meta changed: ${changedSlugs.join(", ")}`);
      await this.refreshHomeStaticFromCache();
    }

    return this.logger;
  }

  /**
   * 清理过期的HOME键
   */
  async cleanupStaleHomeKeys(runtimeConfig) {
    try {
      const allHomeKeys = await this.env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
      const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(t => t.slug));
      const staleKeys = allHomeKeys.keys
        .map(k => k.name)
        .filter(n => n !== KV_KEYS.HOME_STATIC_HTML)
        .filter(n => {
          const slug = n.slice(KV_KEYS.HOME_PREFIX.length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleKeys) await this.env.LOL_KV.delete(key);

      const allLogKeys = await this.env.LOL_KV.list({ prefix: "LOG_" });
      const staleLogKeys = allLogKeys.keys
        .map(k => k.name)
        .filter(n => {
          const slug = n.slice("LOG_".length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleLogKeys) await this.env.LOL_KV.delete(key);

      const allRevKeys = await this.env.LOL_KV.list({ prefix: "REV_" });
      const staleRevKeys = allRevKeys.keys
        .map(k => k.name)
        .filter(n => {
          const slug = n.slice("REV_".length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleRevKeys) await this.env.LOL_KV.delete(key);
    } catch (e) {}
  }

  /**
   * 加载缓存数据
   */
  async loadCachedData(tournaments) {
    const cache = { rawMatches: {}, updateTimestamps: {}, meta: { tournaments: {} }, prevScheduleMap: {} };
    
    const homeEntries = await Promise.all((tournaments || []).map(async t => {
      const data = await this.env.LOL_KV.get(KV_KEYS.HOME_PREFIX + t.slug, { type: "json" });
      return [t.slug, data];
    }));
    
    homeEntries.forEach(([slug, home]) => {
      if (home && home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
      if (home && home.updateTimestamps && home.updateTimestamps[slug]) cache.updateTimestamps[slug] = home.updateTimestamps[slug];
      if (home && home.tournMeta && home.tournMeta[slug]) cache.meta.tournaments[slug] = home.tournMeta[slug];
      if (home && home.scheduleMap) cache.prevScheduleMap[slug] = home.scheduleMap;
    });
    
    return cache;
  }

  /**
   * 确定需要更新的候选锦标赛
   */
  determineCandidates(tournaments, cache, NOW, force, forceSlugs = null, bypassThreshold = false) {
    const candidates = [];
    const hasScope = !!(forceSlugs && forceSlugs.size > 0);
    
    tournaments.forEach(tournament => {
      if (hasScope && !forceSlugs.has(tournament.slug)) {
        return;
      }

      const isForceTarget = force && (!forceSlugs || forceSlugs.has(tournament.slug));
      const lastTs = cache.updateTimestamps[tournament.slug] || 0;
      const elapsed = NOW - lastTs;

      const tMetaFromKV = (cache.meta?.tournaments && cache.meta.tournaments[tournament.slug]);

      if (!tMetaFromKV) {
        if (!bypassThreshold) {
          console.log(`[THRESHOLD] ${tournament.slug} no-kv -> pass`);
        }
        candidates.push({
          slug: tournament.slug, 
          overview_page: tournament.overview_page, 
          league: tournament.league,
          mode: "fast",
          start_date: tournament.start_date || null
        });
        return;
      }

      const currentMode = tMetaFromKV.mode;
      const startTs = tMetaFromKV.startTs || 0;
      const isModeOverride = !!tMetaFromKV.modeOverride;

      const isMatchStarted = startTs > 0 && NOW >= startTs;
      const threshold = (currentMode === "slow" && (isModeOverride || !isMatchStarted)) ? this.getSlowThresholdMs() : 0;

      if (isForceTarget || bypassThreshold || elapsed >= threshold) {
        if (!bypassThreshold) {
          console.log(`[THRESHOLD] ${tournament.slug} ${currentMode} e=${(elapsed/60000).toFixed(1)}m th=${(threshold/60000).toFixed(1)}m -> pass`);
        }
        candidates.push({
          slug: tournament.slug, 
          overview_page: tournament.overview_page, 
          league: tournament.league,
          mode: currentMode,
          start_date: tournament.start_date || null
        });
      } else {
        if (!bypassThreshold) {
          console.log(`[THRESHOLD] ${tournament.slug} ${currentMode} e=${(elapsed/60000).toFixed(1)}m th=${(threshold/60000).toFixed(1)}m -> skip`);
        }
      }
    });

    return candidates;
  }

  /**
   * 抓取比赛数据
   */
  async fetchMatchData(fandomClient, candidates, cache, NOW, updateRounds = 1) {
    const rounds = Math.max(1, Number(updateRounds) || 1);
    const batch = candidates.slice(0, Math.ceil(candidates.length / rounds));
    const results = [];

    for (const c of batch) {
      try {
        const data = await fandomClient.fetchAllMatches(c.slug, c.overview_page, null);
        results.push({ status: 'fulfilled', slug: c.slug, data: data });
      } catch (err) {
        results.push({ status: 'rejected', slug: c.slug, err: err });
      }
      if (c !== batch[batch.length - 1]) await new Promise(res => setTimeout(res, 2000));
    }

    return results;
  }

  /**
   * 处理抓取结果
   */
  processResults(results, cache, NOW, force, runtimeConfig) {
    const failedSlugs = new Set();
    const syncItems = [];
    const idleItems = [];
    const breakers = [];
    const apiErrors = [];

    const getDisplayName = (slug) => {
      const tournament = runtimeConfig.TOURNAMENTS.find(t => t.slug === slug);
      return tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
    };

    const getMatchKey = (match) => {
      const id = match?.MatchId ?? match?.["MatchId"];
      if (id != null && String(id).trim() !== "") return `id:${String(id)}`;
      const overview = match?.OverviewPage ?? match?.["Overview Page"] ?? "";
      const nInPage = match?.N_MatchInPage ?? match?.["N MatchInPage"] ?? "";
      const dt = match?.DateTime_UTC ?? match?.["DateTime UTC"] ?? "";
      const t1 = match?.Team1 ?? match?.["Team 1"] ?? "";
      const t2 = match?.Team2 ?? match?.["Team 2"] ?? "";
      return `fallback:${overview}|${nInPage}|${dt}|${t1}|${t2}`;
    };

    const canonicalMatch = (match) => JSON.stringify({
      MatchId: match?.MatchId ?? match?.["MatchId"] ?? "",
      Team1: match?.Team1 ?? match?.["Team 1"] ?? "",
      Team2: match?.Team2 ?? match?.["Team 2"] ?? "",
      Team1Score: match?.Team1Score ?? match?.["Team 1 Score"] ?? "",
      Team2Score: match?.Team2Score ?? match?.["Team 2 Score"] ?? "",
      DateTime_UTC: match?.DateTime_UTC ?? match?.["DateTime UTC"] ?? "",
      OverviewPage: match?.OverviewPage ?? match?.["Overview Page"] ?? "",
      BestOf: match?.BestOf ?? match?.["Best Of"] ?? "",
      N_MatchInPage: match?.N_MatchInPage ?? match?.["N MatchInPage"] ?? "",
      Tab: match?.Tab ?? "",
      Round: match?.Round ?? ""
    });

    const calcChangedCount = (oldData, newData) => {
      const oldMap = new Map();
      const newMap = new Map();
      for (const m of (oldData || [])) oldMap.set(getMatchKey(m), canonicalMatch(m));
      for (const m of (newData || [])) newMap.set(getMatchKey(m), canonicalMatch(m));

      let added = 0;
      let updated = 0;
      for (const [key, nextVal] of newMap.entries()) {
        const prevVal = oldMap.get(key);
        if (prevVal == null) added++;
        else if (prevVal !== nextVal) updated++;
      }
      return { added, updated, changed: added + updated };
    };

    results.forEach(res => {
      if (res.status === 'fulfilled') {
        const slug = res.slug;
        const newData = res.data || [];
        const oldData = cache.rawMatches[slug] || [];

        if (!force && oldData.length > 10 && newData.length < oldData.length * 0.9) {
          breakers.push(`${slug}(Drop ${oldData.length}->${newData.length})`);
          failedSlugs.add(slug);
        } else {
          const changedCount = calcChangedCount(oldData, newData);
          cache.rawMatches[slug] = newData;
          if (changedCount.changed > 0) {
            syncItems.push({
              slug,
              dName: getDisplayName(slug),
              added: changedCount.added,
              updated: changedCount.updated
            });
          } else {
            idleItems.push({ slug, dName: getDisplayName(slug), added: 0, updated: 0 });
          }
        }
        cache.updateTimestamps[slug] = NOW;
      } else {
        apiErrors.push(`${res.slug}(Fail)`);
        failedSlugs.add(res.slug);
      }
    });

    return { failedSlugs, syncItems, idleItems, breakers, apiErrors };
  }

  /**
   * 生成日志
   */
  generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournMeta) {
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    
    // 格式化项目信息
    const formatItem = (item) => `${item.dName} ${this.formatDeltaTag(item)}`;

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);

    const modeSwitches = [];
    Object.keys(analysis.tournMeta).forEach(slug => {
      const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
      const newMode = analysis.tournMeta[slug].mode;
      if (oldMode !== newMode) {
        modeSwitches.push(oldMode === "fast" ? "⚡->🐌" : "🐌->⚡");
      }
    });
    
    let trafficLight, action, content;
    
    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
      trafficLight = "⚪"; action = "[IDLE]";
      
      let parts = [];
      if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);
      parts.push(`🟰 Ident`);
      if (modeSwitches.length > 0) parts.push(modeSwitches.join(", "));
      
      content = parts.join(" | ");
    } else {
      const hasErr = apiErrors.length > 0 || breakers.length > 0;
      trafficLight = hasErr ? "🔴" : "🟢";
      action = hasErr ? "[ERR!]" : "[SYNC]";

      let parts = [];
      if (syncDetails.length > 0) parts.push(`🔄 ${syncDetails.join(", ")}`);
      if (modeSwitches.length > 0) parts.push(modeSwitches.join(", "));
      if (breakers.length > 0) parts.push(`🚧 ${breakers.join(", ")}`);
      if (apiErrors.length > 0) parts.push(`❌ ${apiErrors.join(", ")}`);

      content = parts.join(" | ");
    }

    const finalLog = `${trafficLight} ${action} | ${authPrefix}${content}`;
    if (trafficLight === "🔴") this.logger.error(finalLog); else this.logger.success(finalLog);
  }

  /**
   * 构建联赛级独立日志
   */
  buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournMeta) {
    const nowShort = dateUtils.getNow().short;
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    const bySlug = {};

    const getDisplayName = (slug) => {
      const t = (runtimeConfig.TOURNAMENTS || []).find(it => it.slug === slug);
      return t ? (t.league || t.name || slug.toUpperCase()) : slug;
    };

    const modeSwitchBySlug = {};
    Object.keys(analysis.tournMeta || {}).forEach(slug => {
      const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
      const newMode = analysis.tournMeta[slug].mode;
      if (oldMode !== newMode) {
        modeSwitchBySlug[slug] = oldMode === "fast" ? "⚡->🐌" : "🐌->⚡";
      }
    });

    const pushEntry = (slug, level, message) => {
      if (!slug) return;
      bySlug[slug] = { t: nowShort, l: level, m: message };
    };

    syncItems.forEach(item => {
      let msg = `🟢 [SYNC] | ${authPrefix}🔄 ${getDisplayName(item.slug)} ${this.formatDeltaTag(item)}`;
      if (modeSwitchBySlug[item.slug]) msg += ` | ${modeSwitchBySlug[item.slug]}`;
      pushEntry(item.slug, "SUCCESS", msg);
    });

    idleItems.forEach(item => {
      if (bySlug[item.slug]) return;
      let msg = `⚪ [IDLE] | ${authPrefix}🔍 ${getDisplayName(item.slug)} ±0 | 🟰 Ident`;
      if (modeSwitchBySlug[item.slug]) msg += ` | ${modeSwitchBySlug[item.slug]}`;
      pushEntry(item.slug, "SUCCESS", msg);
    });

    breakers.forEach(b => {
      const slug = String(b || "").split("(")[0];
      const name = getDisplayName(slug);
      pushEntry(slug, "ERROR", `🔴 [ERR!] | ${authPrefix}🚧 ${name}(Drop)`);
    });

    apiErrors.forEach(e => {
      const slug = String(e || "").split("(")[0];
      const name = getDisplayName(slug);
      pushEntry(slug, "ERROR", `🔴 [ERR!] | ${authPrefix}❌ ${name}(Fail)`);
    });

    return bySlug;
  }

  /**
   * 保存数据
   */
  async saveData(runtimeConfig, cache, analysis, syncItems, force = false, forceSlugs = null, leagueLogEntries = {}, scopedOnly = false, options = {}) {
    const includeArchiveWrites = options.includeArchiveWrites !== false;
    // 保存首页静态HTML
    if (!scopedOnly) {
      try {
        const homeFragment = HTMLRenderer.renderContentOnly(
          analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
          runtimeConfig, false, analysis.tournMeta
        );
        const fullPage = HTMLRenderer.renderPageShell("LoL Insights", homeFragment, "home");
        const existingHomeHTML = await this.env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
        if (existingHomeHTML !== fullPage) {
          console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
          await this.env.LOL_KV.put(KV_KEYS.HOME_STATIC_HTML, fullPage);
        }
      } catch (e) {
        console.error("Error generating home HTML:", e);
      }
    }

    // 按slug组织赛程数据
    const tournIndexMap = new Map((runtimeConfig.TOURNAMENTS || []).map((t, idx) => [t.slug, idx]));
    const scheduleBySlug = {};
    Object.keys(analysis.scheduleMap || {}).forEach(date => {
      const list = analysis.scheduleMap[date] || [];
      list.forEach(match => {
        const slug = match.slug;
        const normalizedMatch = {
          ...match,
          tournIndex: tournIndexMap.has(slug) ? tournIndexMap.get(slug) : (match.tournIndex ?? 9999)
        };
        if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
        if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
        scheduleBySlug[slug][date].push(normalizedMatch);
      });
    });

    // 保存每个锦标赛的数据
    const writePromises = [];
    for (const tournament of runtimeConfig.TOURNAMENTS) {
      const slug = tournament.slug;
      const isForceTarget = force && (!forceSlugs || forceSlugs.has(slug));
      const raw = cache.rawMatches[slug] || [];
      const ts = cache.updateTimestamps[slug] || 0;
      const stats = analysis.globalStats[slug] || {};
      const grid = analysis.timeGrid[slug] || {};
      const tournamentMeta = analysis.tournMeta[slug] ? { [slug]: analysis.tournMeta[slug] } : {};

      const teamMap = tournament.team_map || {};
      const { team_map: _, ...tournamentStored } = tournament;

      // 数据变化检测
      const homeKey = KV_KEYS.HOME_PREFIX + slug;
      const existingHome = await this.env.LOL_KV.get(homeKey, { type: "json" });

      const homeSnapshot = {
        tourn: tournamentStored,
        rawMatches: raw,
        updateTimestamps: { [slug]: ts },
        stats: stats,
        timeGrid: grid,
        scheduleMap: scheduleBySlug[slug] || {},
        tournMeta: tournamentMeta,
        team_map: teamMap
      };

      let homeHasChanges = isForceTarget || !existingHome ||
          JSON.stringify(existingHome.rawMatches || []) !== JSON.stringify(raw) ||
          JSON.stringify(existingHome.tournMeta || {}) !== JSON.stringify(tournamentMeta);

      if (homeHasChanges) {
        console.log(`[KV] PUT ${homeKey}`);
        writePromises.push(this.env.LOL_KV.put(homeKey, JSON.stringify(homeSnapshot)));
      }

      // 保存归档数据
      if (includeArchiveWrites && stats && Object.keys(stats).length > 0) {
        const snapshot = { tourn: tournamentStored, rawMatches: raw, updateTimestamps: { [slug]: ts }, team_map: teamMap };
        const archiveKey = `ARCHIVE_${slug}`;
        const existingArchive = await this.env.LOL_KV.get(archiveKey, { type: "json" });
        const archiveHasChanges = isForceTarget || !existingArchive ||
            JSON.stringify(existingArchive.rawMatches || []) !== JSON.stringify(raw);

        if (archiveHasChanges) {
          console.log(`[KV] PUT ${archiveKey}`);
          writePromises.push(this.env.LOL_KV.put(archiveKey, JSON.stringify(snapshot)));
        }
      }
    }

    await Promise.all(writePromises);

    // 联赛级日志写入独立键（LOG_<slug>），避免影响 HOME_ 写入规则
    const logEntries = leagueLogEntries || {};
    const logWrites = Object.entries(logEntries).map(async ([slug, entry]) => {
      if (!slug || !entry) return;
      const logKey = `LOG_${slug}`;
      const oldLogs = await this.env.LOL_KV.get(logKey, { type: "json" }) || [];
      const nextLogs = [entry, ...oldLogs].slice(0, 10);
      await this.env.LOL_KV.put(logKey, JSON.stringify(nextLogs));
    });
    if (logWrites.length > 0) await Promise.all(logWrites);

    // 只有有数据变化时才重新生成归档HTML
    if (syncItems.length > 0) {
      try {
        const archiveHTML = await this.generateArchiveStaticHTML();
        const existingArchiveHTML = await this.env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
        if (existingArchiveHTML !== archiveHTML) {
          console.log(`[KV] PUT ${KV_KEYS.ARCHIVE_STATIC_HTML}`);
          await this.env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
        }
      } catch (e) {
        console.error("Error generating archive HTML:", e);
      }
    }

    // 单联赛 force：仅在有数据变化时刷新首页静态HTML（基于已有 HOME_ 缓存重组，不触发全量分析）
    if (scopedOnly && syncItems.length > 0) {
      await this.refreshHomeStaticFromCache();
    }

  }

  /**
   * 基于 HOME_ 缓存重建首页静态HTML（轻量，不重新抓取/分析全联赛）
   */
  async refreshHomeStaticFromCache() {
    const result = await this.rebuildStaticPagesFromCache({ includeArchive: false, requireData: false });
    return result;
  }

  /**
   * 从 HOME_ 缓存重建静态页面
   */
  async rebuildStaticPagesFromCache(options = {}) {
    const includeArchive = options.includeArchive !== false;
    const requireData = options.requireData !== false;
    const maxScheduleDays = this.getMaxScheduleDays();
    const allHomeKeys = await this.env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
    const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== KV_KEYS.HOME_STATIC_HTML);
    const rawHomes = await Promise.all(dataKeys.map(k => this.env.LOL_KV.get(k, { type: "json" })));
    const homeEntries = rawHomes.filter(h => h && h.tourn);
    if (homeEntries.length === 0) {
      if (requireData) return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
      return { ok: true, homes: 0, writes: 0, homeChanged: false, archiveChanged: false };
    }

    const sortedTourns = dateUtils.sortTournamentsByDate(homeEntries.map(h => h.tourn));
    const runtimeConfig = { TOURNAMENTS: sortedTourns };
    const tournIndexMap = new Map((sortedTourns || []).map((t, idx) => [t.slug, idx]));
    const globalStats = {};
    const timeGrid = {};
    const scheduleMap = {};
    const tournMeta = {};

    homeEntries.forEach(home => {
      const slug = home.tourn?.slug;
      if (!slug) return;
      if (home.stats) globalStats[slug] = home.stats;
      if (home.timeGrid) timeGrid[slug] = home.timeGrid;
      if (home.tournMeta && home.tournMeta[slug]) tournMeta[slug] = home.tournMeta[slug];

      const sch = home.scheduleMap || {};
      Object.keys(sch).forEach(date => {
        if (!scheduleMap[date]) scheduleMap[date] = [];
        (sch[date] || []).forEach(m => {
          const slug = m?.slug;
          scheduleMap[date].push({
            ...m,
            tournIndex: tournIndexMap.has(slug) ? tournIndexMap.get(slug) : (m?.tournIndex ?? 9999)
          });
        });
      });
    });

    Object.keys(scheduleMap).forEach(date => {
      scheduleMap[date].sort((a, b) => {
        if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
        return (a.time || "").localeCompare(b.time || "");
      });
    });

    const limitedScheduleMap = dateUtils.pruneScheduleMapByDayStatus(
      scheduleMap,
      maxScheduleDays,
      dateUtils.getNow().date
    );

    if (requireData && Object.keys(globalStats).length === 0) {
      return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
    }

    const homeFragment = HTMLRenderer.renderContentOnly(
      globalStats, timeGrid, limitedScheduleMap, runtimeConfig, false, tournMeta
    );
    const fullPage = HTMLRenderer.renderPageShell("LoL Insights", homeFragment, "home");
    const existingHomeHTML = await this.env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
    const writePromises = [];
    let homeChanged = false;
    if (existingHomeHTML !== fullPage) {
      console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
      writePromises.push(this.env.LOL_KV.put(KV_KEYS.HOME_STATIC_HTML, fullPage));
      homeChanged = true;
    }

    let archiveChanged = false;
    if (includeArchive) {
      const archiveHTML = await this.generateArchiveStaticHTML();
      const existingArchiveHTML = await this.env.LOL_KV.get(KV_KEYS.ARCHIVE_STATIC_HTML);
      if (existingArchiveHTML !== archiveHTML) {
        writePromises.push(this.env.LOL_KV.put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML));
        archiveChanged = true;
      }
    }

    await Promise.all(writePromises);
    return {
      ok: true,
      homes: homeEntries.length,
      writes: writePromises.length,
      homeChanged,
      archiveChanged
    };
  }

  /**
   * 生成归档静态HTML
   */
  async generateArchiveStaticHTML() {
    try {
      const allKeys = await this.env.LOL_KV.list({ prefix: "ARCHIVE_" });
      const dataKeys = allKeys.keys.filter(k => k.name !== KV_KEYS.ARCHIVE_STATIC_HTML);

      if (!dataKeys.length) {
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
      }

      const rawSnapshots = await Promise.all(dataKeys.map(k => this.env.LOL_KV.get(k.name, { type: "json" })));
      let validSnapshots = rawSnapshots.filter(s => s && s.tourn && s.tourn.slug);

      validSnapshots = dateUtils.sortTournamentsByDate(validSnapshots);

      const combined = validSnapshots.map(snap => {
        const tournamentWithMap = { ...snap.tourn, team_map: snap.team_map || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snap.tourn.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snap.tourn.slug] || {};
        const timeObj = analysis.timeGrid[snap.tourn.slug] || {};
        const content = HTMLRenderer.renderContentOnly(
          { [snap.tourn.slug]: statsObj },
          { [snap.tourn.slug]: timeObj },
          {}, miniConfig, true
        );
        return content;
      }).join("");

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (e) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${e.message}</div>`, "archive");
    }
  }
}

/**
 * 日志记录器
 */
class Logger {
  constructor() { 
    this.l = []; 
  }
  
  error(m) { 
    this.l.push({
      t: dateUtils.getNow().short, 
      l: 'ERROR', 
      m: m
    }); 
  }
  
  success(m) { 
    this.l.push({
      t: dateUtils.getNow().short, 
      l: 'SUCCESS', 
      m: m
    }); 
  }
  
  export() { 
    return this.l; 
  }
}
