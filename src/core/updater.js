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

  /**
   * Cron入口：先做revid轻量检测，再决定是否触发更新
   */
  async runScheduledUpdate() {
    const startedAt = Date.now();
    console.log("[CRON] runScheduledUpdate start");
    const runtimeConfig = await this.loadRuntimeConfig();
    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      console.log("[CRON] runtimeConfig load failed");
      return this.logger;
    }
    console.log(`[CRON] tournaments=${(runtimeConfig.TOURNAMENTS || []).length}`);

    const NOW = Date.now();
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS || []);
    const { changedSlugs, hasErrors } = await this.detectRevisionChanges(runtimeConfig.TOURNAMENTS || [], cache, NOW);
    console.log(`[CRON] rev-check done changed=${changedSlugs.size} hasErrors=${hasErrors}`);

    if (hasErrors) console.log("[REV-GATE] Revision check had partial errors, no fallback");

    if (changedSlugs.size === 0) {
      console.log("[REV-GATE] No revision change, skip cron update");
      return this.logger;
    }

    console.log(`[REV-GATE] Changed slugs: ${Array.from(changedSlugs).join(", ")}`);
    console.log(`[CRON] runScheduledUpdate finish elapsedMs=${Date.now() - startedAt}`);
    return this.runUpdate(false, changedSlugs, {
      bypassThreshold: true,
      fullFetch: true,
      forceWrite: false
    });
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
    const startedAt = Date.now();
    const changedSlugs = new Set();
    let hasErrors = false;
    console.log(`[REV] detect start tournaments=${(tournaments || []).length}`);

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
      console.log(`[REV] ${slug}: pages=${dataPages.length} (Data namespace only)`);

      const tMetaFromKV = cache?.meta?.tournaments?.[slug];
      const lastTs = cache?.updateTimestamps?.[slug] || 0;
      const elapsed = NOW - lastTs;
      let threshold = 0;
      let mode = "fast";

      if (tMetaFromKV) {
        mode = tMetaFromKV.mode || "fast";
        const startTs = tMetaFromKV.startTs || 0;
        const isModeOverride = !!tMetaFromKV.modeOverride;
        const isMatchStarted = startTs > 0 && NOW >= startTs;
        threshold = (mode === "slow" && (isModeOverride || !isMatchStarted)) ? this.getSlowThresholdMs() : 0;
      }

      console.log(`[REV-THRESHOLD] ${slug}: mode=${mode}, threshold=${threshold / 1000 / 60}m, elapsed=${elapsed / 1000 / 60}m`);
      if (elapsed < threshold) {
        console.log(`[REV-SKIP] ${slug}: elapsed=${elapsed / 1000 / 60}m < threshold=${threshold / 1000 / 60}m`);
        continue;
      }

      const revKey = `REV_${slug}`;
      const prev = await this.env.LOL_KV.get(revKey, { type: "json" });
      const prevPages = prev?.pages || {};
      const nextPages = {};
      let slugChanged = false;
      let okCount = 0;
      let errCount = 0;

      for (const page of dataPages) {
        try {
          const latest = await FandomClient.fetchLatestRevision(page);
          if (latest?.missing) {
            console.log(`[REV] ${slug}: query=${page} resolved=${latest.title} missing=true`);
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
            console.log(`[REV] ${slug}: ${title} ${prevRev || "none"} -> ${latest.revid}`);
          } else {
            console.log(`[REV] ${slug}: ${title} unchanged=${latest.revid}`);
          }
        } catch (e) {
          errCount++;
          console.log(`[REV] ${slug}: ${page} check failed: ${e.message}`);
        }
      }

      if (errCount > 0 && okCount === 0) hasErrors = true;

      const prevNormalized = { slug, pages: prevPages || {} };
      const nextRecord = { slug, pages: nextPages || {} };
      const shouldWriteRev = JSON.stringify(prevNormalized) !== JSON.stringify(nextRecord);
      if (shouldWriteRev) {
        console.log(`[REV] ${slug}: save REV_${slug} pages=${Object.keys(nextPages).length}`);
        await this.env.LOL_KV.put(revKey, JSON.stringify(nextRecord));
      }

      if (slugChanged) changedSlugs.add(slug);
      console.log(`[REV] ${slug}: changed=${slugChanged} ok=${okCount} err=${errCount} writeRev=${shouldWriteRev}`);
    }

    console.log(`[REV] detect finish changed=${changedSlugs.size} hasErrors=${hasErrors} elapsedMs=${Date.now() - startedAt}`);
    return { changedSlugs, hasErrors };
  }

  /**
   * 运行更新任务
   */
  async runUpdate(force = false, forceSlugs = null, options = {}) {
    const bypassThreshold = !!options.bypassThreshold;
    const fullFetch = !!options.fullFetch;
    const forceWrite = options.forceWrite === undefined ? force : !!options.forceWrite;
    const isScopedRun = !!(forceSlugs && forceSlugs.size > 0);
    console.log(`[UPDATE] start force=${!!force} scoped=${isScopedRun} slugs=${forceSlugs ? Array.from(forceSlugs).join(",") : "-"}`);
    const NOW = Date.now();
    const updateRounds = this.getUpdateRounds();

    // 加载配置
    let runtimeConfig = null;
    let teamsRaw = null;
    try {
      teamsRaw = await this.githubClient.fetchJson("config/teams.json");
      runtimeConfig = await this.loadRuntimeConfig();
    } catch (e) {}

    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      return this.logger;
    }

    // 清理过期的HOME键
    await this.cleanupStaleHomeKeys(runtimeConfig);

    // 加载缓存数据
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    runtimeConfig.TOURNAMENTS = dateUtils.sortTournamentsByDate(runtimeConfig.TOURNAMENTS);

    // 确定需要更新的锦标赛
    const candidates = this.determineCandidates(runtimeConfig.TOURNAMENTS, cache, NOW, force, forceSlugs, bypassThreshold);
    console.log(`[UPDATE] candidates=${candidates.length}`);
    if (candidates.length === 0) {
      console.log(`[SKIP] All tournaments skipped`);
      return this.logger;
    }

    // 登录到Fandom
    const authContext = await FandomClient.login(this.env.FANDOM_USER, this.env.FANDOM_PASS);
    const fandomClient = new FandomClient(authContext);

    // 执行数据抓取
    const results = await this.fetchMatchData(fandomClient, candidates, cache, NOW, force || fullFetch, updateRounds);
    console.log(`[UPDATE] fetch results=${results.length}`);

    // 处理结果
    const { failedSlugs, syncItems, idleItems, breakers, apiErrors } = this.processResults(results, cache, NOW, force, runtimeConfig);
    console.log(`[UPDATE] process sync=${syncItems.length} idle=${idleItems.length} breakers=${breakers.length} apiErrors=${apiErrors.length} failed=${failedSlugs.size}`);

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
    const analysis = Analyzer.runFullAnalysis(cache.rawMatches, oldTournMeta, scopedRuntimeConfig, failedSlugs, modeOverrides, cache.prevScheduleMap);

    // 生成日志
    this.generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournMeta);
    const leagueLogEntries = this.buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, scopedRuntimeConfig, oldTournMeta);

    // 保存数据
    await this.saveData(scopedRuntimeConfig, cache, analysis, syncItems, forceWrite, forceSlugs, leagueLogEntries, isScopedRun);

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
        console.log(`[THRESHOLD] ${tournament.slug}: NO_KV_DATA, use fast mode, threshold=0`);
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

      console.log(`[THRESHOLD] ${tournament.slug}: mode=${currentMode}, startTs=${startTs}, isMatchStarted=${isMatchStarted}, threshold=${threshold/1000/60}m, elapsed=${elapsed/1000/60}m`);

      if (isForceTarget || bypassThreshold || elapsed >= threshold) {
        candidates.push({
          slug: tournament.slug, 
          overview_page: tournament.overview_page, 
          league: tournament.league,
          mode: currentMode,
          start_date: tournament.start_date || null
        });
      } else {
        console.log(`[SKIP] ${tournament.slug}: mode=${currentMode}, elapsed=${elapsed/1000/60}m < threshold=${threshold/1000/60}m`);
      }
    });

    return candidates;
  }

  /**
   * 抓取比赛数据
   */
  async fetchMatchData(fandomClient, candidates, cache, NOW, force, updateRounds = 1) {
    const pastDateObj = new Date(NOW - 48 * 60 * 60 * 1000);
    const futureDateObj = new Date(NOW + 48 * 60 * 60 * 1000);
    const deltaStartUTC = pastDateObj.toISOString().slice(0, 10);
    const deltaEndUTC = futureDateObj.toISOString().slice(0, 10);

    const rounds = Math.max(1, Number(updateRounds) || 1);
    const batch = candidates.slice(0, Math.ceil(candidates.length / rounds));
    const results = [];

    for (const c of batch) {
      try {
        const oldData = cache.rawMatches[c.slug] || [];
        let beforeFirstMatch = false;
        if (c.start_date) {
          const startDt = dateUtils.parseDate(`${c.start_date} 00:00:00`);
          if (startDt && NOW < startDt.getTime()) beforeFirstMatch = true;
        }
        const isFullFetch = force || oldData.length === 0 || c.mode === "slow" || beforeFirstMatch;
        const dateQuery = isFullFetch ? null : { start: deltaStartUTC, end: deltaEndUTC };

        const data = await fandomClient.fetchAllMatches(c.slug, c.overview_page, dateQuery);
        results.push({ status: 'fulfilled', slug: c.slug, data: data, isDelta: !isFullFetch });
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

    const fieldAliases = {
      MatchId: ["MatchId"],
      Team1: ["Team1", "Team 1"],
      Team2: ["Team2", "Team 2"],
      Team1Score: ["Team1Score", "Team 1 Score"],
      Team2Score: ["Team2Score", "Team 2 Score"],
      DateTime_UTC: ["DateTime_UTC", "DateTime UTC"],
      OverviewPage: ["OverviewPage", "Overview Page"],
      BestOf: ["BestOf", "Best Of"],
      N_MatchInPage: ["N_MatchInPage", "N MatchInPage"],
      Tab: ["Tab"],
      Round: ["Round"]
    };

    const getField = (match, name) => {
      const keys = fieldAliases[name] || [name];
      for (const k of keys) {
        if (match != null && Object.prototype.hasOwnProperty.call(match, k)) return match[k];
      }
      return undefined;
    };

    const normalize = (v) => (v == null ? "" : String(v));
    const isSameMatch = (a, b) => {
      const fields = ["MatchId", "Team1", "Team2", "Team1Score", "Team2Score", "DateTime_UTC", "OverviewPage", "BestOf", "N_MatchInPage", "Tab", "Round"];
      for (const f of fields) {
        if (normalize(getField(a, f)) !== normalize(getField(b, f))) return false;
      }
      return true;
    };

    const getUniqueKey = (match) => {
      const id = match.MatchId ?? match["MatchId"];
      return String(id ?? "");
    };

    results.forEach(res => {
      if (res.status === 'fulfilled') {
        const slug = res.slug;
        const newData = res.data || [];
        const oldData = cache.rawMatches[slug] || [];

        if (res.isDelta) {
          if (newData.length > 0) {
            const matchMap = new Map();
            oldData.forEach(match => matchMap.set(getUniqueKey(match), match));

            let changesCount = 0;
            newData.forEach(match => {
              const key = getUniqueKey(match);
              const oldMatch = matchMap.get(key);
              if (!oldMatch || !isSameMatch(oldMatch, match)) {
                matchMap.set(key, match);
                changesCount++;
              }
            });

            if (changesCount > 0) {
              const mergedList = Array.from(matchMap.values());
              mergedList.sort((a, b) => {
                const tA = a.DateTime_UTC || "9999-99-99";
                const tB = b.DateTime_UTC || "9999-99-99";
                return tA.localeCompare(tB);
              });
              cache.rawMatches[slug] = mergedList;
              syncItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: changesCount });
            } else {
              idleItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: 0 });
            }
          } else {
            idleItems.push({ slug, dName: getDisplayName(slug), type: "delta", count: 0 });
          }
        } else {
          if (!force && oldData.length > 10 && newData.length < oldData.length * 0.9) {
            breakers.push(`${slug}(Drop)`);
            failedSlugs.add(slug);
          } else {
            cache.rawMatches[slug] = newData;
            if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
              syncItems.push({ slug, dName: getDisplayName(slug), type: "full", count: newData.length });
            } else {
              idleItems.push({ slug, dName: getDisplayName(slug), type: "full", count: newData.length });
            }
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
    
    // 格式化倒计时信息
    const formatCountdown = (slug) => {
      const metaNow = analysis.tournMeta[slug] || oldTournMeta[slug] || { mode: "fast" };
      const mode = metaNow.mode;
      const modeIcon = mode === "slow" ? "🐌" : "⚡";
      const countdownMins = mode === "slow"
        ? Math.ceil(this.getSlowThresholdMs() / 60000)
        : this.getCronIntervalMinutes();
      return { modeIcon, countdownMins, mode };
    };

    // 格式化项目信息
    const formatItem = (item) => {
      const info = formatCountdown(item.slug);
      const prefix = item.type === "delta" ? "+" : "*";
      return `${item.dName} ${prefix}${item.count} (${info.modeIcon}${info.countdownMins}m)`;
    };

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);
    
    // 模式切换检测
    const modeSwitches = [];
    Object.keys(analysis.tournMeta).forEach(slug => {
      const oldMode = (oldTournMeta[slug] && oldTournMeta[slug].mode) || "fast";
      const newMode = analysis.tournMeta[slug].mode;

      if (oldMode !== newMode) {
        const tournament = runtimeConfig.TOURNAMENTS.find(it => it.slug === slug);
        const displayName = tournament ? (tournament.league || tournament.name || slug.toUpperCase()) : slug;
        const arrow = oldMode === "fast" ? "⚡->🐌" : "🐌->⚡";
        modeSwitches.push(`${displayName}(${arrow})`);
      }
    });

    let trafficLight, action, content;
    
    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
      trafficLight = "⚪"; action = "[IDLE]";
      
      let parts = [];
      if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);
      parts.push(`🟰 Identical`);
      if (modeSwitches.length > 0) parts.push(`⚙️ ${modeSwitches.join(", ")}`);
      
      content = parts.join(" | ");
    } else {
      const hasErr = apiErrors.length > 0 || breakers.length > 0;
      trafficLight = hasErr ? "🔴" : "🟢";
      action = hasErr ? "[ERR!]" : "[SYNC]";

      let parts = [];
      if (syncDetails.length > 0) parts.push(`🔄 ${syncDetails.join(", ")}`);
      if (modeSwitches.length > 0) parts.push(`⚙️ ${modeSwitches.join(", ")}`);
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

    const getCountdown = (slug) => {
      const metaNow = analysis.tournMeta[slug] || oldTournMeta[slug] || { mode: "fast" };
      const mode = metaNow.mode;
      const modeIcon = mode === "slow" ? "🐌" : "⚡";
      const countdownMins = mode === "slow"
        ? Math.ceil(this.getSlowThresholdMs() / 60000)
        : this.getCronIntervalMinutes();
      return { modeIcon, countdownMins };
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
      const cd = getCountdown(item.slug);
      const prefix = item.type === "delta" ? "+" : "*";
      let msg = `🟢 [SYNC] | ${authPrefix}🔄 ${getDisplayName(item.slug)} ${prefix}${item.count} (${cd.modeIcon}${cd.countdownMins}m)`;
      if (modeSwitchBySlug[item.slug]) msg += ` | ⚙️ ${getDisplayName(item.slug)}(${modeSwitchBySlug[item.slug]})`;
      pushEntry(item.slug, "SUCCESS", msg);
    });

    idleItems.forEach(item => {
      if (bySlug[item.slug]) return;
      const cd = getCountdown(item.slug);
      const prefix = item.type === "delta" ? "+" : "*";
      let msg = `⚪ [IDLE] | ${authPrefix}🔍 ${getDisplayName(item.slug)} ${prefix}${item.count} (${cd.modeIcon}${cd.countdownMins}m) | 🟰 Identical`;
      if (modeSwitchBySlug[item.slug]) msg += ` | ⚙️ ${getDisplayName(item.slug)}(${modeSwitchBySlug[item.slug]})`;
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
  async saveData(runtimeConfig, cache, analysis, syncItems, force = false, forceSlugs = null, leagueLogEntries = {}, scopedOnly = false) {
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
    const scheduleBySlug = {};
    Object.keys(analysis.scheduleMap || {}).forEach(date => {
      const list = analysis.scheduleMap[date] || [];
      list.forEach(match => {
        const slug = match.slug;
        if (!scheduleBySlug[slug]) scheduleBySlug[slug] = {};
        if (!scheduleBySlug[slug][date]) scheduleBySlug[slug][date] = [];
        scheduleBySlug[slug][date].push(match);
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

      const mode = tournamentMeta[slug]?.mode || "fast";
      let homeHasChanges = isForceTarget || !existingHome ||
          JSON.stringify(existingHome.rawMatches || []) !== JSON.stringify(raw) ||
          JSON.stringify(existingHome.tournMeta || {}) !== JSON.stringify(tournamentMeta);

      if (!force && mode === "slow") {
        homeHasChanges = homeHasChanges ||
          JSON.stringify(existingHome.updateTimestamps || {}) !== JSON.stringify({ [slug]: ts });
      }

      if (homeHasChanges) {
        console.log(`[KV] PUT ${homeKey}`);
        writePromises.push(this.env.LOL_KV.put(homeKey, JSON.stringify(homeSnapshot)));
      }

      // 保存归档数据
      if (stats && Object.keys(stats).length > 0) {
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
    const allHomeKeys = await this.env.LOL_KV.list({ prefix: KV_KEYS.HOME_PREFIX });
    const dataKeys = allHomeKeys.keys.map(k => k.name).filter(n => n !== KV_KEYS.HOME_STATIC_HTML);
    const rawHomes = await Promise.all(dataKeys.map(k => this.env.LOL_KV.get(k, { type: "json" })));
    const homeEntries = rawHomes.filter(h => h && h.tourn);
    if (homeEntries.length === 0) return;

    const sortedTourns = dateUtils.sortTournamentsByDate(homeEntries.map(h => h.tourn));
    const runtimeConfig = { TOURNAMENTS: sortedTourns };
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
        scheduleMap[date].push(...sch[date]);
      });
    });

    Object.keys(scheduleMap).forEach(date => {
      scheduleMap[date].sort((a, b) => {
        if (a.tournIndex !== b.tournIndex) return a.tournIndex - b.tournIndex;
        return (a.time || "").localeCompare(b.time || "");
      });
    });

    const homeFragment = HTMLRenderer.renderContentOnly(
      globalStats, timeGrid, scheduleMap, runtimeConfig, false, tournMeta
    );
    const fullPage = HTMLRenderer.renderPageShell("LoL Insights", homeFragment, "home");
    const existingHomeHTML = await this.env.LOL_KV.get(KV_KEYS.HOME_STATIC_HTML);
    if (existingHomeHTML !== fullPage) {
      console.log(`[KV] PUT ${KV_KEYS.HOME_STATIC_HTML}`);
      await this.env.LOL_KV.put(KV_KEYS.HOME_STATIC_HTML, fullPage);
    }
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
