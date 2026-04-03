import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { Analyzer } from './analyzer.js';
import { HTMLRenderer } from '../render/htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { KV_KEYS } from '../utils/constants.js';
import { readMetaState, writeMetaState } from '../utils/Meta.js';

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
    return "~0";
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
    const today = dateUtils.getNow().dateString;
    const meta = await readMetaState(this.env);
    const lastDay = meta.scheduleDayMark;
    if (lastDay === today) return;

    await this.cleanupStaleHomeKeys(runtimeConfig);
    await this.refreshHomeStaticFromCache();
    await writeMetaState(this.env, { ...meta, scheduleDayMark: today });
    console.log(`[SCHEDULE] rollover refresh ${lastDay || "none"} -> ${today}`);
  }

  /**
   * 加载运行时配置
   */
  async loadRuntimeConfig() {
    try {
      const tournaments = await this.githubClient.fetchJson("config/tour.json");
      if (tournaments) return { TOURNAMENTS: tournaments };
    } catch (error) {}
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
        .filter(page => typeof page === "string")
        .map(page => page.trim())
        .filter(Boolean);

      if (pages.length === 0) continue;
      // revid gate 只看 Data: 页面，避免被 Overview 页面的无关编辑触发
      const dataPages = Array.from(new Set(pages.map(page => page.startsWith("Data:") ? page : `Data:${page}`)));
      const tournamentMetaFromKv = cache?.meta?.tournaments?.[slug];
      const lastUpdateTimestamp = cache?.updateTimestamps?.[slug] || 0;
      const revKey = `REV_${slug}`;
      const previousRevisionState = await this.env["lol-stats-kv"].get(revKey, { type: "json" });
      const lastCheckedAt = Number(previousRevisionState?.checkedAt) || 0;
      const gateBaseTimestamp = Math.max(lastUpdateTimestamp, lastCheckedAt);
      const elapsed = NOW - gateBaseTimestamp;
      let threshold = 0;
      let mode = "fast";

      if (tournamentMetaFromKv) {
        mode = tournamentMetaFromKv.mode || "fast";
        const startTimestamp = tournamentMetaFromKv.startTimestamp || 0;
        const isModeOverride = !!tournamentMetaFromKv.modeOverride;
        const isMatchStarted = startTimestamp > 0 && NOW >= startTimestamp;
        threshold = (mode === "slow" && (isModeOverride || !isMatchStarted)) ? this.getSlowThresholdMs() : 0;
      }

      if (elapsed < threshold) {
        console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> skip`);
        thresholdSkippedSlugs++;
        continue;
      }
      console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> check`);
      checkedSlugs++;

      const prevPages = previousRevisionState?.pages || {};
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
        } catch (error) {
          errCount++;
          console.log(`[REV] ${slug}: ${page} check failed: ${error.message}`);
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
        await this.env["lol-stats-kv"].put(revKey, JSON.stringify(nextRecord));
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
    } catch (error) {}

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
    for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tournament.slug] || [];
      tournament.teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, rawMatches);
    }

    // 从 tournamentMeta 中提取 modeOverrides
    const oldTournamentMeta = cache.meta?.tournaments || {};
    const modeOverrides = {};
    for (const [slug, meta] of Object.entries(oldTournamentMeta)) {
      if (meta.modeOverride) modeOverrides[slug] = meta.modeOverride;
    }

    const scopedRuntimeConfig = isScopedRun
      ? { TOURNAMENTS: (runtimeConfig.TOURNAMENTS || []).filter(tournament => forceSlugs.has(tournament.slug)) }
      : runtimeConfig;

    // 分析数据
    const analysis = Analyzer.runFullAnalysis(cache.rawMatches, oldTournamentMeta, scopedRuntimeConfig, failedSlugs, modeOverrides, cache.prevScheduleMap, this.getMaxScheduleDays());

    // 生成日志
    this.generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournamentMeta);
    const leagueLogEntries = this.buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournamentMeta);

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

    for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tournament.slug] || [];
      tournament.teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, rawMatches);
    }

    const oldTournamentMeta = cache.meta?.tournaments || {};
    const modeOverrides = {};
    for (const [slug, meta] of Object.entries(oldTournamentMeta)) {
      if (meta.modeOverride) modeOverrides[slug] = meta.modeOverride;
    }

    const targetTournaments = isScopedRun
      ? (runtimeConfig.TOURNAMENTS || []).filter(tournament => forceSlugs.has(tournament.slug))
      : (runtimeConfig.TOURNAMENTS || []);

    const nowTimestamp = Date.now();
    const changedSlugs = [];
    const nextTournamentMeta = { ...oldTournamentMeta };

    for (const tournament of targetTournaments) {
      const slug = tournament.slug;
      const rawMatches = cache.rawMatches[slug] || [];
      const previousMetaForTournament = oldTournamentMeta[slug] || {};
      const nextMeta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp, {
        modeOverride: modeOverrides[slug],
        previousMode: previousMetaForTournament.mode || "fast",
        hasFailure: false
      });

      if (JSON.stringify(previousMetaForTournament) === JSON.stringify(nextMeta)) continue;
      nextTournamentMeta[slug] = nextMeta;
      changedSlugs.push(slug);
    }

    if (changedSlugs.length > 0) {
      await writeMetaState(this.env, {
        ...(cache.meta || {}),
        tournaments: nextTournamentMeta
      });
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
      const allHomeKeys = await this.env["lol-stats-kv"].list({ prefix: KV_KEYS.HOME_PREFIX });
      const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(tournament => tournament.slug));
      const staleKeys = allHomeKeys.keys
        .map(key => key.name)
        .filter(keyName => keyName !== KV_KEYS.HOME_STATIC_HTML)
        .filter(keyName => {
          const slug = keyName.slice(KV_KEYS.HOME_PREFIX.length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleKeys) await this.env["lol-stats-kv"].delete(key);

      const allLogKeys = await this.env["lol-stats-kv"].list({ prefix: "LOG_" });
      const staleLogKeys = allLogKeys.keys
        .map(key => key.name)
        .filter(keyName => {
          const slug = keyName.slice("LOG_".length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleLogKeys) await this.env["lol-stats-kv"].delete(key);

      const allRevKeys = await this.env["lol-stats-kv"].list({ prefix: "REV_" });
      const staleRevKeys = allRevKeys.keys
        .map(key => key.name)
        .filter(keyName => {
          const slug = keyName.slice("REV_".length);
          return !activeSlugs.has(slug);
        });
      for (const key of staleRevKeys) await this.env["lol-stats-kv"].delete(key);
    } catch (error) {}
  }

  /**
   * 加载缓存数据
   */
  async loadCachedData(tournaments) {
    const cache = { rawMatches: {}, updateTimestamps: {}, meta: { tournaments: {}, scheduleDayMark: null }, prevScheduleMap: {} };
    
    const homeEntries = await Promise.all((tournaments || []).map(async tournament => {
      const data = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_PREFIX + tournament.slug, { type: "json" });
      return [tournament.slug, data];
    }));

    const metaState = await readMetaState(this.env);
    const mergedTournamentsMeta = { ...(metaState.tournaments || {}) };
    
    homeEntries.forEach(([slug, home]) => {
      if (home && home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
      if (home && home.updateTimestamps && home.updateTimestamps[slug]) cache.updateTimestamps[slug] = home.updateTimestamps[slug];
      if (home && home.scheduleMap) cache.prevScheduleMap[slug] = home.scheduleMap;

    });

    cache.meta = {
      tournaments: mergedTournamentsMeta,
      scheduleDayMark: metaState.scheduleDayMark || null
    };
    
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
      const lastUpdateTimestamp = cache.updateTimestamps[tournament.slug] || 0;
      const elapsed = NOW - lastUpdateTimestamp;

      const tournamentMetaFromKv = (cache.meta?.tournaments && cache.meta.tournaments[tournament.slug]);

      if (!tournamentMetaFromKv) {
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

      const currentMode = tournamentMetaFromKv.mode;
      const startTimestamp = tournamentMetaFromKv.startTimestamp || 0;
      const isModeOverride = !!tournamentMetaFromKv.modeOverride;

      const isMatchStarted = startTimestamp > 0 && NOW >= startTimestamp;
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

    for (const candidate of batch) {
      try {
        const data = await fandomClient.fetchAllMatches(candidate.slug, candidate.overview_page, null);
        results.push({ status: 'fulfilled', slug: candidate.slug, data: data });
      } catch (err) {
        results.push({ status: 'rejected', slug: candidate.slug, err: err });
      }
      if (candidate !== batch[batch.length - 1]) await new Promise(resolveDelay => setTimeout(resolveDelay, 2000));
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
      const tournament = runtimeConfig.TOURNAMENTS.find(tournamentItem => tournamentItem.slug === slug);
      return tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
    };

    const getMatchKey = (match) => {
      const matchId = match?.MatchId ?? match?.["MatchId"];
      if (matchId != null && String(matchId).trim() !== "") return `id:${String(matchId)}`;
      const overview = match?.OverviewPage ?? match?.["Overview Page"] ?? "";
      const nInPage = match?.N_MatchInPage ?? match?.["N MatchInPage"] ?? "";
      const dateTimeUtc = match?.DateTime_UTC ?? match?.["DateTime UTC"] ?? "";
      const team1Name = match?.Team1 ?? match?.["Team 1"] ?? "";
      const team2Name = match?.Team2 ?? match?.["Team 2"] ?? "";
      return `fallback:${overview}|${nInPage}|${dateTimeUtc}|${team1Name}|${team2Name}`;
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
      for (const matchRecord of (oldData || [])) oldMap.set(getMatchKey(matchRecord), canonicalMatch(matchRecord));
      for (const matchRecord of (newData || [])) newMap.set(getMatchKey(matchRecord), canonicalMatch(matchRecord));

      let added = 0;
      let updated = 0;
      for (const [key, nextVal] of newMap.entries()) {
        const prevVal = oldMap.get(key);
        if (prevVal == null) added++;
        else if (prevVal !== nextVal) updated++;
      }
      return { added, updated, changed: added + updated };
    };

    results.forEach(resultItem => {
      if (resultItem.status === 'fulfilled') {
        const slug = resultItem.slug;
        const newData = resultItem.data || [];
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
              displayName: getDisplayName(slug),
              added: changedCount.added,
              updated: changedCount.updated
            });
          } else {
            idleItems.push({ slug, displayName: getDisplayName(slug), added: 0, updated: 0 });
          }
        }
        cache.updateTimestamps[slug] = NOW;
      } else {
        apiErrors.push(`${resultItem.slug}(Fail)`);
        failedSlugs.add(resultItem.slug);
      }
    });

    return { failedSlugs, syncItems, idleItems, breakers, apiErrors };
  }

  /**
   * 生成日志
   */
  generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta) {
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    
    // 格式化项目信息
    const formatItem = (item) => `${item.displayName} ${this.formatDeltaTag(item)}`;

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);

    let trafficLight, action, content;
    
    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
      trafficLight = "⚪"; action = "[IDLE]";
      
      let parts = [];
      if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);
      parts.push(`🟰 Identical`);
      
      content = parts.join(" | ");
    } else {
      const hasErr = apiErrors.length > 0 || breakers.length > 0;
      trafficLight = hasErr ? "🔴" : "🟢";
      action = hasErr ? "[ERR!]" : "[SYNC]";

      let parts = [];
      if (syncDetails.length > 0) parts.push(`🔄 ${syncDetails.join(", ")}`);
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
  buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta) {
    const nowShort = dateUtils.getNow().shortDateTimeString;
    const isAnon = (!authContext || authContext.isAnonymous);
    const authPrefix = isAnon ? "👻 " : "";
    const bySlug = {};

    const getDisplayName = (slug) => {
      const tournament = (runtimeConfig.TOURNAMENTS || []).find(item => item.slug === slug);
      return tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
    };

    const pushEntry = (slug, level, message) => {
      if (!slug) return;
      bySlug[slug] = { timestamp: nowShort, level, message };
    };

    syncItems.forEach(item => {
      let messageText = `🟢 [SYNC] | ${authPrefix}🔄 ${getDisplayName(item.slug)} ${this.formatDeltaTag(item)}`;
      pushEntry(item.slug, "SUCCESS", messageText);
    });

    idleItems.forEach(item => {
      if (bySlug[item.slug]) return;
      let messageText = `⚪ [IDLE] | ${authPrefix}🔍 ${getDisplayName(item.slug)} ~0 | 🟰 Identical`;
      pushEntry(item.slug, "SUCCESS", messageText);
    });

    breakers.forEach(breaker => {
      const slug = String(breaker || "").split("(")[0];
      const name = getDisplayName(slug);
      pushEntry(slug, "ERROR", `🔴 [ERR!] | ${authPrefix}🚧 ${name}(Drop)`);
    });

    apiErrors.forEach(apiError => {
      const slug = String(apiError || "").split("(")[0];
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

    const mergedMetaState = {
      ...(cache.meta || {}),
      tournaments: {
        ...(cache.meta?.tournaments || {}),
        ...(analysis.tournamentMeta || {})
      }
    };
    if (JSON.stringify(mergedMetaState.tournaments || {}) !== JSON.stringify(cache.meta?.tournaments || {})) {
      await writeMetaState(this.env, mergedMetaState);
      cache.meta = mergedMetaState;
    }

    // 保存首页静态HTML
    if (!scopedOnly) {
      try {
        const homeFragment = HTMLRenderer.renderContentOnly(
          analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
          runtimeConfig, false, (analysis.tournamentMeta || {})
        );
        const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home");
        const existingHomeHTML = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_STATIC_HTML);
        if (existingHomeHTML !== fullPage) {
          console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
          await this.env["lol-stats-kv"].put(KV_KEYS.HOME_STATIC_HTML, fullPage);
        }
      } catch (error) {
        console.error("Error generating home HTML:", error);
      }
    }

    // 按slug组织赛程数据
    const tournamentIndexMap = new Map((runtimeConfig.TOURNAMENTS || []).map((tournament, index) => [tournament.slug, index]));
    const scheduleBySlug = {};
    Object.keys(analysis.scheduleMap || {}).forEach(date => {
      const list = analysis.scheduleMap[date] || [];
      list.forEach(match => {
        const slug = match.slug;
        const normalizedMatch = {
          ...match,
          tournamentIndex: tournamentIndexMap.has(slug)
            ? tournamentIndexMap.get(slug)
            : (match.tournamentIndex ?? 9999)
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
      const updateTimestamp = cache.updateTimestamps[slug] || 0;
      const stats = analysis.globalStats[slug] || {};
      const grid = analysis.timeGrid[slug] || {};

      const teamMap = tournament.teamMap || {};
      const { teamMap: _, ...tournamentStored } = tournament;

      // 数据变化检测
      const homeKey = KV_KEYS.HOME_PREFIX + slug;
      const existingHome = await this.env["lol-stats-kv"].get(homeKey, { type: "json" });

      const homeSnapshot = {
        tournament: tournamentStored,
        rawMatches: raw,
        updateTimestamps: { [slug]: updateTimestamp },
        stats: stats,
        timeGrid: grid,
        scheduleMap: scheduleBySlug[slug] || {},
        teamMap: teamMap
      };

      let homeHasChanges = isForceTarget || !existingHome ||
          JSON.stringify(existingHome.rawMatches || []) !== JSON.stringify(raw);

      if (homeHasChanges) {
        console.log(`[KV] PUT ${homeKey}`);
        writePromises.push(this.env["lol-stats-kv"].put(homeKey, JSON.stringify(homeSnapshot)));
      }

      // 保存归档数据
      if (includeArchiveWrites && stats && Object.keys(stats).length > 0) {
        const snapshot = { tournament: tournamentStored, rawMatches: raw, updateTimestamps: { [slug]: updateTimestamp }, teamMap: teamMap };
        const archiveKey = `ARCHIVE_${slug}`;
        const existingArchive = await this.env["lol-stats-kv"].get(archiveKey, { type: "json" });
        const archiveHasChanges = isForceTarget || !existingArchive ||
            JSON.stringify(existingArchive.rawMatches || []) !== JSON.stringify(raw);

        if (archiveHasChanges) {
          console.log(`[KV] PUT ${archiveKey}`);
          writePromises.push(this.env["lol-stats-kv"].put(archiveKey, JSON.stringify(snapshot)));
        }
      }
    }

    await Promise.all(writePromises);

    // 联赛级日志写入独立键（LOG_<slug>），避免影响 HOME_ 写入规则
    const logEntries = leagueLogEntries || {};
    const logWrites = Object.entries(logEntries).map(async ([slug, entry]) => {
      if (!slug || !entry) return;
      const logKey = `LOG_${slug}`;
      const oldLogs = await this.env["lol-stats-kv"].get(logKey, { type: "json" }) || [];
      const nextLogs = [entry, ...oldLogs].slice(0, 10);
      await this.env["lol-stats-kv"].put(logKey, JSON.stringify(nextLogs));
    });
    if (logWrites.length > 0) await Promise.all(logWrites);

    // 只有有数据变化时才重新生成归档HTML
    if (syncItems.length > 0) {
      try {
        const archiveHTML = await this.generateArchiveStaticHTML();
        const existingArchiveHTML = await this.env["lol-stats-kv"].get(KV_KEYS.ARCHIVE_STATIC_HTML);
        if (existingArchiveHTML !== archiveHTML) {
          console.log(`[KV] PUT ${KV_KEYS.ARCHIVE_STATIC_HTML}`);
          await this.env["lol-stats-kv"].put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
        }
      } catch (error) {
        console.error("Error generating archive HTML:", error);
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
    const allHomeKeys = await this.env["lol-stats-kv"].list({ prefix: KV_KEYS.HOME_PREFIX });
    const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== KV_KEYS.HOME_STATIC_HTML);
    const rawHomes = await Promise.all(dataKeys.map(key => this.env["lol-stats-kv"].get(key, { type: "json" })));
    const homeEntries = rawHomes.filter(home => home && home.tournament);
    if (homeEntries.length === 0) {
      if (requireData) return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
      return { ok: true, homes: 0, writes: 0, homeChanged: false, archiveChanged: false };
    }

    const sortedTournaments = dateUtils.sortTournamentsByDate(homeEntries.map(home => home.tournament));
    const runtimeConfig = { TOURNAMENTS: sortedTournaments };
    const tournamentIndexMap = new Map((sortedTournaments || []).map((tournament, index) => [tournament.slug, index]));
    const globalStats = {};
    const timeGrid = {};
    const scheduleMap = {};
    const metaState = await readMetaState(this.env);
    const tournamentMeta = { ...(metaState.tournaments || {}) };

    homeEntries.forEach(home => {
      const homeTournament = home.tournament;
      const slug = homeTournament?.slug;
      if (!slug) return;
      if (home.stats) globalStats[slug] = home.stats;
      if (home.timeGrid) timeGrid[slug] = home.timeGrid;

      const schedule = home.scheduleMap || {};
      Object.keys(schedule).forEach(date => {
        if (!scheduleMap[date]) scheduleMap[date] = [];
        (schedule[date] || []).forEach(match => {
          const slug = match?.slug;
          scheduleMap[date].push({
            ...match,
            tournamentIndex: tournamentIndexMap.has(slug)
              ? tournamentIndexMap.get(slug)
              : (match?.tournamentIndex ?? 9999)
          });
        });
      });
    });

    Object.keys(scheduleMap).forEach(date => {
      scheduleMap[date].sort((leftMatch, rightMatch) => {
        const leftTournamentIndex = leftMatch.tournamentIndex ?? 9999;
        const rightTournamentIndex = rightMatch.tournamentIndex ?? 9999;
        if (leftTournamentIndex !== rightTournamentIndex) return leftTournamentIndex - rightTournamentIndex;
        return (leftMatch.time || "").localeCompare(rightMatch.time || "");
      });
    });

    const limitedScheduleMap = dateUtils.pruneScheduleMapByDayStatus(
      scheduleMap,
      maxScheduleDays,
      dateUtils.getNow().dateString
    );

    if (requireData && Object.keys(globalStats).length === 0) {
      return { ok: false, reason: "NO_CACHE", message: "No cache data available. Run Refresh API first." };
    }

    const homeFragment = HTMLRenderer.renderContentOnly(
      globalStats, timeGrid, limitedScheduleMap, runtimeConfig, false, tournamentMeta
    );
    const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home");
    const existingHomeHTML = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_STATIC_HTML);
    const writePromises = [];
    let homeChanged = false;
    if (existingHomeHTML !== fullPage) {
      console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
      writePromises.push(this.env["lol-stats-kv"].put(KV_KEYS.HOME_STATIC_HTML, fullPage));
      homeChanged = true;
    }

    let archiveChanged = false;
    if (includeArchive) {
      const archiveHTML = await this.generateArchiveStaticHTML();
      const existingArchiveHTML = await this.env["lol-stats-kv"].get(KV_KEYS.ARCHIVE_STATIC_HTML);
      if (existingArchiveHTML !== archiveHTML) {
        writePromises.push(this.env["lol-stats-kv"].put(KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML));
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
      const allKeys = await this.env["lol-stats-kv"].list({ prefix: "ARCHIVE_" });
      const dataKeys = allKeys.keys.filter(key => key.name !== KV_KEYS.ARCHIVE_STATIC_HTML);

      if (!dataKeys.length) {
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive");
      }

      const rawSnapshots = await Promise.all(dataKeys.map(key => this.env["lol-stats-kv"].get(key.name, { type: "json" })));
      let validSnapshots = rawSnapshots.filter(snapshot => {
        const snapshotTournament = snapshot?.tournament;
        return Boolean(snapshot && snapshotTournament && snapshotTournament.slug);
      });

      validSnapshots = dateUtils
        .sortTournamentsByDate(validSnapshots.map(snapshot => {
          const snapshotTournament = snapshot.tournament;
          return { ...snapshotTournament, __snapshot: snapshot };
        }))
        .map(tournament => tournament.__snapshot);

      const combined = validSnapshots.map(snap => {
        const snapshotTournament = snap.tournament;
        const tournamentWithMap = { ...snapshotTournament, teamMap: snap.teamMap || {} };
        const miniConfig = { TOURNAMENTS: [tournamentWithMap] };
        const analysis = Analyzer.runFullAnalysis({ [snapshotTournament.slug]: snap.rawMatches || [] }, {}, miniConfig);
        const statsObj = analysis.globalStats[snapshotTournament.slug] || {};
        const timeObj = analysis.timeGrid[snapshotTournament.slug] || {};
        const content = HTMLRenderer.renderContentOnly(
          { [snapshotTournament.slug]: statsObj },
          { [snapshotTournament.slug]: timeObj },
          {}, miniConfig, true
        );
        return content;
      }).join("");

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive");
    } catch (error) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${error.message}</div>`, "archive");
    }
  }
}

/**
 * 日志记录器
 */
class Logger {
  constructor() { 
    this.logs = []; 
  }
  
  error(message) { 
    this.logs.push({
      timestamp: dateUtils.getNow().shortDateTimeString,
      level: 'ERROR',
      message
    }); 
  }
  
  success(message) { 
    this.logs.push({
      timestamp: dateUtils.getNow().shortDateTimeString,
      level: 'SUCCESS',
      message
    }); 
  }
  
  export() { 
    return this.logs; 
  }
}
