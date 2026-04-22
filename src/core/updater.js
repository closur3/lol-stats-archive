import { GitHubClient } from '../api/githubClient.js';
import { FandomClient } from '../api/fandomClient.js';
import { Analyzer } from './analyzer.js';
import { HTMLRenderer } from '../render/htmlRenderer.js';
import { dateUtils } from '../utils/dateUtils.js';
import { dataUtils } from '../utils/dataUtils.js';
import { KV_KEYS } from '../utils/constants.js';
import { readMetaState, writeMetaState, rewriteMetaState as rewriteMetaStateKV, tournamentMetaEqual } from '../utils/Meta.js';
import { kvPut, kvDelete } from '../utils/kvStore.js';

// 更新配置常量
export const UPDATE_CONFIG = {
  DROP_THRESHOLD: 0.9,            // 数据下降阈值：新数据 < 旧数据 * 0.9 时触发保护
  MAX_LOG_ENTRIES: 10,             // 每个联赛保留的最大日志条数
  SLOW_THRESHOLD_MINUTES: 60,      // slow 模式阈值（分钟）
  CRON_INTERVAL_MINUTES: 2,        // 日志页快模式显示分钟数
  MAX_SCHEDULE_DAYS: 8,            // 赛程最大显示天数
};

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
    return UPDATE_CONFIG.SLOW_THRESHOLD_MINUTES * 60 * 1000;
  }

  getMaxScheduleDays() {
    return UPDATE_CONFIG.MAX_SCHEDULE_DAYS;
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

    // Cron path skips eager meta rewrite. Meta is normalized on actual write paths
    // (day rollover / local update / fandom update), avoiding a fixed KV read each round.
    await this.refreshScheduleBoardOnDayRollover(runtimeConfig);

    const NOW = Date.now();
    const activeSlugs = (runtimeConfig.TOURNAMENTS || []).map(tournament => tournament?.slug).filter(Boolean);
    const metaForRevGate = await readMetaState(this.env, activeSlugs);
    const revGateCache = {
      meta: {
        tournaments: metaForRevGate.tournaments || {},
        scheduleDayMark: metaForRevGate.scheduleDayMark || null
      }
    };
    const { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs, thresholdSkippedSlugs } = await this.detectRevisionChanges(runtimeConfig.TOURNAMENTS || [], revGateCache, NOW);
    console.log(`[CRON] rev-check checked=${checkedSlugs} th-skip=${thresholdSkippedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0} elapsedMs=${Date.now() - startedAt}`);
    const targetSlugs = new Set(changedSlugs);

    if (targetSlugs.size === 0) {
      console.log("[REV-GATE] No revision changes, running local update");
      return this.runLocalUpdate({ skipMetaRewrite: true });
    }

    console.log(`[REV-GATE] Target slugs: ${Array.from(targetSlugs).join(", ")}`);
    return this.runFandomUpdate(false, targetSlugs, {
      forceWrite: false,
      revidChanges: revidChanges,
      pendingRevisionWrites,
      skipMetaRewrite: true
    });
  }

  /**
   * 每天UTC切日后刷新一次赛程板，确保过期天按新规则清理
   */
  async refreshScheduleBoardOnDayRollover(runtimeConfig) {
    const today = dateUtils.getNow().dateString;
    const activeSlugs = (runtimeConfig.TOURNAMENTS || []).map(tournament => tournament?.slug).filter(Boolean);
    const meta = await readMetaState(this.env, activeSlugs);
    const lastDay = meta.scheduleDayMark;
    if (lastDay === today) return;

    await this.cleanupStaleHomeKeys(runtimeConfig);
    await this.refreshHomeStaticFromCache();
    await writeMetaState(this.env, {
      tournamentMetaBySlug: meta.tournaments || {},
      scheduleDayMark: today,
      activeSlugs
    });
    console.log(`[SCHEDULE] rollover refresh ${lastDay || "none"} -> ${today}`);
  }

  /**
   * 加载运行时配置
   */
  async loadRuntimeConfig() {
    try {
      const tournaments = await this.githubClient.fetchJson("config/tour.json");
      if (tournaments) return { TOURNAMENTS: tournaments };
    } catch (error) { console.error("[Config] Failed to load runtime config:", error.message); }
    return null;
  }

  /**
   * 比较 overview_page 最新 revision，找出发生编辑的联赛
   */
  async detectRevisionChanges(tournaments, cache, NOW) {
    const changedSlugs = new Set();
    const revidChanges = {};
    const pendingRevisionWrites = {};
    let hasErrors = false;
    let checkedSlugs = 0;
    let thresholdSkippedSlugs = 0;

    // 第一步：并行检查所有联赛的阈值
    const thresholdChecks = await Promise.all(
      (tournaments || []).map(async (tournament) => {
        const slug = tournament?.slug;
        if (!slug) return null;

        const pages = (Array.isArray(tournament.overview_page) ? tournament.overview_page : [tournament.overview_page])
          .filter(page => typeof page === "string")
          .map(page => page.trim())
          .filter(Boolean);

        if (pages.length === 0) return null;

        const dataPages = Array.from(new Set(pages.map(page => page.startsWith("Data:") ? page : `Data:${page}`)));
        const tournamentMetaFromKv = cache?.meta?.tournaments?.[slug];
        const revKey = `REV_${slug}`;
        const previousRevisionState = await this.env["lol-stats-kv"].get(revKey, { type: "json" });
        const lastCheckedAt = Number(previousRevisionState?.checkedAt) || 0;
        const elapsed = NOW - lastCheckedAt;
        let threshold = 0;
        let mode = "fast";

        if (tournamentMetaFromKv) {
          mode = tournamentMetaFromKv.mode || "fast";
          const startTimestamp = tournamentMetaFromKv.startTimestamp || 0;
          const isMatchStarted = startTimestamp > 0 && NOW >= startTimestamp;
          threshold = (mode === "slow" && !isMatchStarted) ? this.getSlowThresholdMs() : 0;
        }

        const shouldSkip = elapsed < threshold;
        if (!shouldSkip) {
          console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> check`);
        } else {
          console.log(`[REV-TH] ${slug} ${mode} e=${(elapsed / 60000).toFixed(1)} th=${(threshold / 60000).toFixed(1)} -> skip`);
        }

        return {
          slug,
          dataPages,
          previousRevisionState,
          lastCheckedAt,
          mode,
          shouldSkip,
          tournament
        };
      })
    );

    // 第二步：并行检查需要更新的联赛的 revid
    const revChecks = await Promise.allSettled(
      thresholdChecks
        .filter(check => check && !check.shouldSkip)
        .map(async (check) => {
          const { slug, dataPages, previousRevisionState, lastCheckedAt, mode } = check;
          checkedSlugs++;

          const prevPages = previousRevisionState?.pages || {};
          const nextPages = {};
          let slugChanged = false;
          let okCount = 0;
          let errCount = 0;
          const changedPages = [];

          // 并行检查所有页面
          const pageResults = await Promise.allSettled(
            dataPages.map(async (page) => {
              const latest = await FandomClient.fetchLatestRevision(page);
              return { page, latest };
            })
          );

          for (const pageResult of pageResults) {
            if (pageResult.status === 'rejected') {
              errCount++;
              console.log(`[REV] ${slug}: ${pageResult.reason?.message || 'unknown error'}`);
              continue;
            }

            const { page, latest } = pageResult.value;
            if (latest?.missing) continue;

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

              const safeTitle = title.replace(/ /g, '_');
              const diffUrl = `https://lol.fandom.com/wiki/${safeTitle}?diff=prev&oldid=${latest.revid}`;
              if (!revidChanges[slug]) revidChanges[slug] = [];
              revidChanges[slug].push({ revid: latest.revid, diffUrl, title });
            }
          }

          if (errCount > 0 && okCount === 0) hasErrors = true;

          const shouldTrackCheckedAt = mode === "slow" ? okCount > 0 : slugChanged;
          const checkedAt = shouldTrackCheckedAt ? NOW : lastCheckedAt;
          const nextRecord = { slug, pages: nextPages || {}, checkedAt };
          const shouldWriteRev = this.hasRevisionRecordChanged(
            { slug, pages: prevPages || {}, checkedAt: lastCheckedAt },
            nextRecord
          );

          return {
            slug,
            shouldWriteRev,
            nextRecord,
            okCount,
            slugChanged,
            errCount,
            changedPages
          };
        })
    );

    // 第三步：处理结果，记录待提交的 REV 写入
    for (const checkResult of revChecks) {
      if (checkResult.status === 'rejected') continue;

      const { slug, shouldWriteRev, nextRecord, okCount, slugChanged, errCount, changedPages } = checkResult.value;

      if (shouldWriteRev && okCount > 0) {
        pendingRevisionWrites[slug] = nextRecord;
      }

      if (slugChanged) {
        changedSlugs.add(slug);
        console.log(`[REV] ${slug}: changed pages=${changedPages.length}${changedPages.length ? ` | ${changedPages.join(", ")}` : ""}`);
      } else if (errCount > 0) {
        console.log(`[REV] ${slug}: partial errors ok=${okCount} err=${errCount}`);
      }
    }

    // 统计跳过的
    thresholdSkippedSlugs = thresholdChecks.filter(check => check && check.shouldSkip).length;

    return { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs, thresholdSkippedSlugs };
  }

  hasRevisionRecordChanged(previousRecord, nextRecord) {
    const prev = previousRecord || {};
    const next = nextRecord || {};
    if ((prev.slug || "") !== (next.slug || "")) return true;
    if ((Number(prev.checkedAt) || 0) !== (Number(next.checkedAt) || 0)) return true;

    const prevPages = prev.pages && typeof prev.pages === "object" ? prev.pages : {};
    const nextPages = next.pages && typeof next.pages === "object" ? next.pages : {};
    const prevTitles = Object.keys(prevPages);
    const nextTitles = Object.keys(nextPages);
    if (prevTitles.length !== nextTitles.length) return true;

    for (const title of prevTitles) {
      if (!Object.prototype.hasOwnProperty.call(nextPages, title)) return true;
      const prevPage = prevPages[title] || {};
      const nextPage = nextPages[title] || {};
      if ((Number(prevPage.revid) || 0) !== (Number(nextPage.revid) || 0)) return true;
      if ((prevPage.timestamp || "") !== (nextPage.timestamp || "")) return true;
      if ((Number(prevPage.pageid) || 0) !== (Number(nextPage.pageid) || 0)) return true;
    }
    return false;
  }

  async prepareRuntimeContext(options = {}) {
    const skipMetaRewrite = options.skipMetaRewrite === true;
    const NOW = Date.now();
    let runtimeConfig = null;
    let teamsRaw = null;
    try {
      teamsRaw = await this.githubClient.fetchJson("config/teams.json");
      runtimeConfig = await this.loadRuntimeConfig();
    } catch (error) { console.error("[Context] Failed to prepare runtime context:", error.message); }

    if (!runtimeConfig) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail)`);
      return null;
    }

    if (!skipMetaRewrite) {
      await this.rewriteMetaState(runtimeConfig);
    }
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    runtimeConfig.TOURNAMENTS = dateUtils.sortTournamentsByDate(runtimeConfig.TOURNAMENTS);
    return { NOW, runtimeConfig, teamsRaw, cache };
  }

  async rewriteMetaState(runtimeConfig) {
    const activeSlugs = (runtimeConfig?.TOURNAMENTS || []).map(tournament => tournament?.slug).filter(Boolean);
    return rewriteMetaStateKV(this.env, { activeSlugs });
  }

  /**
   * 联网更新：查Fandom并写回
   */
  async runFandomUpdate(force = false, forceSlugs = null, options = {}) {
    const forceWrite = options.forceWrite === undefined ? force : !!options.forceWrite;
    const passedRevidChanges = options.revidChanges || {};
    const pendingRevisionWrites = options.pendingRevisionWrites || {};
    const skipMetaRewrite = options.skipMetaRewrite === true;
    const context = await this.prepareRuntimeContext({ skipMetaRewrite });
    if (!context) return this.logger;
    const { NOW, runtimeConfig, teamsRaw, cache } = context;

    // 确定需要更新的锦标赛
    const candidates = this.determineCandidates(runtimeConfig.TOURNAMENTS, forceSlugs);
    if (candidates.length === 0) {
      console.log(`[SKIP] All tournaments skipped`);
      return this.logger;
    }

    // 优先使用传入的 revidChanges（避免重复检测导致读到已更新的 KV）
    const revidChanges = passedRevidChanges;

    // 登录到Fandom
    const authContext = await FandomClient.login(this.env.FANDOM_USER, this.env.FANDOM_PASS);
    const fandomClient = new FandomClient(authContext);

    // 执行数据抓取
    const results = await this.fetchMatchData(fandomClient, candidates);

    // 处理结果
    const { failedSlugs, syncItems, idleItems, breakers, apiErrors, displayNameMap } = this.processResults(results, cache, force, forceSlugs, runtimeConfig);
    console.log(`[FANDOM] process sync=${syncItems.length} idle=${idleItems.length} breakers=${breakers.length} apiErrors=${apiErrors.length} failed=${failedSlugs.size}`);

    // 将 revid 变化信息注入 syncItems 和 idleItems
    for (const item of [...syncItems, ...idleItems]) {
      if (revidChanges[item.slug]) {
        item.revidChanges = revidChanges[item.slug];
      }
    }

    // 准备锦标赛上下文（teamMap）
    const { oldTournamentMeta } = this.prepareTournamentContext(runtimeConfig, cache, teamsRaw);

    // 分析数据（始终使用完整 runtimeConfig 以确保首页 HTML 包含所有赛事）
    const analysis = Analyzer.runFullAnalysis(cache.rawMatches, oldTournamentMeta, runtimeConfig, failedSlugs, cache.prevScheduleMap, this.getMaxScheduleDays());

    // 生成日志
    this.generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta);
    const leagueLogEntries = this.buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta, displayNameMap);

    // 保存数据
    const saveSummary = await this.saveData(runtimeConfig, cache, analysis, syncItems, forceWrite, forceSlugs, leagueLogEntries);

    await this.commitRevisionWrites(pendingRevisionWrites, failedSlugs, saveSummary?.failedHomeSlugs || new Set());

    return this.logger;
  }

  async commitRevisionWrites(pendingRevisionWrites, failedSlugs = new Set(), failedHomeSlugs = new Set()) {
    const entries = Object.entries(pendingRevisionWrites || {}).filter(([slug, record]) => {
      if (!slug || !record) return false;
      if (failedSlugs.has(slug)) return false;
      if (failedHomeSlugs.has(slug)) return false;
      return true;
    });

    await Promise.all(entries.map(([slug, record]) => {
      const revKey = `REV_${slug}`;
      return kvPut(this.env, revKey, JSON.stringify(record));
    }));
  }

  /**
   * 准备锦标赛上下文（teamMap）
   */
  prepareTournamentContext(runtimeConfig, cache, teamsRaw) {
    for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
      const rawMatches = cache.rawMatches[tournament.slug] || [];
      tournament.teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, rawMatches);
    }

    const oldTournamentMeta = cache.meta?.tournaments || {};
    return { oldTournamentMeta };
  }

  /**
   * 本地更新：不联网，仅基于缓存重算并写入（用于revid未变化场景）
   */
  async runLocalUpdate(options = {}) {
    const skipMetaRewrite = options.skipMetaRewrite === true;
    const context = await this.prepareRuntimeContext({ skipMetaRewrite });
    if (!context) return this.logger;
    const { runtimeConfig, teamsRaw, cache } = context;

    const { oldTournamentMeta } = this.prepareTournamentContext(runtimeConfig, cache, teamsRaw);

    const nowTimestamp = Date.now();
    const changedSlugs = [];
    const changedTournamentMeta = {};

    for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
      const slug = tournament.slug;
      const rawMatches = cache.rawMatches[slug] || [];
      const previousMetaForTournament = oldTournamentMeta[slug] || {};
      const computedMeta = Analyzer.computeTournamentMetaFromRawMatches(rawMatches, nowTimestamp, {
        previousMode: previousMetaForTournament.mode || "fast",
        hasFailure: false
      });
      const nextMeta = {
        ...previousMetaForTournament,
        ...computedMeta
      };

      if (tournamentMetaEqual(previousMetaForTournament, nextMeta)) continue;
      changedTournamentMeta[slug] = nextMeta;
      changedSlugs.push(slug);
    }

    if (changedSlugs.length > 0) {
      await writeMetaState(this.env, {
        tournamentMetaBySlug: changedTournamentMeta,
        scheduleDayMark: cache.meta?.scheduleDayMark || null,
        activeSlugs: (runtimeConfig.TOURNAMENTS || []).map(tournament => tournament?.slug).filter(Boolean)
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
      const [allHomeKeys, allLogKeys, allRevKeys] = await Promise.all([
        this.env["lol-stats-kv"].list({ prefix: KV_KEYS.HOME_PREFIX }),
        this.env["lol-stats-kv"].list({ prefix: "LOG_" }),
        this.env["lol-stats-kv"].list({ prefix: "REV_" })
      ]);

      const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(tournament => tournament.slug));

      // 找出所有不在当前配置中的 SLUG (即将过期)
      const staleHomeKeys = allHomeKeys.keys
        .map(key => key.name)
        .filter(keyName => keyName !== KV_KEYS.HOME_STATIC_HTML && !activeSlugs.has(keyName.slice(KV_KEYS.HOME_PREFIX.length)));

      const staleLogKeys = allLogKeys.keys
        .map(key => key.name)
        .filter(keyName => !activeSlugs.has(keyName.slice("LOG_".length)));

      const staleRevKeys = allRevKeys.keys
        .map(key => key.name)
        .filter(keyName => !activeSlugs.has(keyName.slice("REV_".length)));

      // 核心优化：在删除 HOME 数据前，将其移入存档页
      // 这样存档页只包含已结束的联赛，且不占用活跃联赛的写入配额
      if (staleHomeKeys.length > 0) {
        // 1. 并行读取所有过期的数据
        const staleData = await Promise.all(
          staleHomeKeys.map(k => this.env["lol-stats-kv"].get(k, { type: "json" }))
        );

        // 2. 并行写入存档
        const archiveWrites = staleHomeKeys.map((k, i) => {
          if (staleData[i]) {
            return kvPut(this.env, `ARCHIVE_${k.slice(KV_KEYS.HOME_PREFIX.length)}`, JSON.stringify(staleData[i]));
          }
          return Promise.resolve();
        });
        await Promise.all(archiveWrites);
        console.log(`[ARCHIVE-MOVE] Moved ${staleHomeKeys.length} expired slugs to archive`);
      }

      // 3. 清理所有过期键
      if (staleHomeKeys.length > 0 || staleLogKeys.length > 0 || staleRevKeys.length > 0) {
        await Promise.all([
          ...staleHomeKeys.map(key => kvDelete(this.env, key)),
          ...staleLogKeys.map(key => kvDelete(this.env, key)),
          ...staleRevKeys.map(key => kvDelete(this.env, key))
        ]);
      }

      // 4. 如果有数据移入存档，刷新存档页 HTML
      if (staleHomeKeys.length > 0) {
        try {
          const archiveHTML = await this.generateArchiveStaticHTML();
          const existingArchiveHTML = await this.env["lol-stats-kv"].get(KV_KEYS.ARCHIVE_STATIC_HTML);
          if (existingArchiveHTML !== archiveHTML) {
            await kvPut(this.env, KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
            console.log(`[ARCHIVE] Refreshed static HTML`);
          }
        } catch (error) {
          console.error(`[ARCHIVE] Refresh failed: ${error.message}`);
        }
      }

    } catch (error) { console.error("[Cleanup] Failed to cleanup stale home keys:", error.message); }
  }

  /**
   * 加载缓存数据
   */
  async loadCachedData(tournaments) {
    const cache = { rawMatches: {}, meta: { tournaments: {}, scheduleDayMark: null }, prevScheduleMap: {} };
    const activeSlugs = (tournaments || []).map(tournament => tournament?.slug).filter(Boolean);
    
    const homeEntries = await Promise.all((tournaments || []).map(async tournament => {
      const homeEntry = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_PREFIX + tournament.slug, { type: "json" });
      return [tournament.slug, homeEntry];
    }));

    const metaState = await readMetaState(this.env, activeSlugs);
    const mergedTournamentsMeta = { ...(metaState.tournaments || {}) };
    
    homeEntries.forEach(([slug, home]) => {
      if (home && home.rawMatches) cache.rawMatches[slug] = home.rawMatches;
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
  determineCandidates(tournaments, forceSlugs = null) {
    const candidates = [];
    const hasScope = !!(forceSlugs && forceSlugs.size > 0);

    tournaments.forEach(tournament => {
      const slug = tournament?.slug;
      if (!slug) return; // 跳过无效 slug

      if (hasScope && !forceSlugs.has(slug)) {
        return;
      }

      candidates.push({
        slug,
        overview_page: tournament.overview_page,
        league: tournament.league,
        start_date: tournament.start_date || null
      });
    });

    return candidates;
  }

  /**
   * 抓取比赛数据
   */
  async fetchMatchData(fandomClient, candidates) {
    const results = await Promise.allSettled(
      candidates.map(async (candidate) => {
        const fetchedMatches = await fandomClient.fetchAllMatches(candidate.slug, candidate.overview_page, null);
        return { slug: candidate.slug, data: fetchedMatches };
      })
    );

    return results.map((result, index) => {
      const slug = candidates[index].slug;
      if (result.status === 'fulfilled') {
        return { status: 'fulfilled', slug, data: result.value.data };
      } else {
        return { status: 'rejected', slug, err: result.reason };
      }
    });
  }

  /**
   * 处理抓取结果
   */
  processResults(results, cache, force, forceSlugs, runtimeConfig) {
    const failedSlugs = new Set();
    const syncItems = [];
    const idleItems = [];
    const breakers = [];
    const apiErrors = [];

    // 提前构建 Map 避免 O(n) 查找
    const displayNameMap = new Map(
      (runtimeConfig.TOURNAMENTS || []).map(t => [
        t.slug, t.league || t.name || t.slug.toUpperCase()
      ])
    );
    const getDisplayName = (slug) => displayNameMap.get(slug) || slug;

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

    const canonicalMatch = (match) => [
      match?.MatchId ?? match?.["MatchId"] ?? "",
      match?.Team1 ?? match?.["Team 1"] ?? "",
      match?.Team2 ?? match?.["Team 2"] ?? "",
      match?.Team1Score ?? match?.["Team 1 Score"] ?? "",
      match?.Team2Score ?? match?.["Team 2 Score"] ?? "",
      match?.DateTime_UTC ?? match?.["DateTime UTC"] ?? "",
      match?.OverviewPage ?? match?.["Overview Page"] ?? "",
      match?.BestOf ?? match?.["Best Of"] ?? "",
      match?.N_MatchInPage ?? match?.["N MatchInPage"] ?? "",
      match?.Tab ?? "",
      match?.Round ?? ""
    ].join("\u001f");

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

    const isTargetSlug = (slug) => (forceSlugs && forceSlugs.has(slug));

    results.forEach(resultItem => {
      if (resultItem.status === 'fulfilled') {
        const slug = resultItem.slug;
        const newData = resultItem.data || [];
        const oldData = cache.rawMatches[slug] || [];
        const isForce = force || isTargetSlug(slug);

        if (!isForce && oldData.length > 10 && newData.length < oldData.length * UPDATE_CONFIG.DROP_THRESHOLD) {
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
              updated: changedCount.updated,
              isForce
            });
          } else {
            idleItems.push({ slug, displayName: getDisplayName(slug), added: 0, updated: 0, isForce });
          }
        }
      } else {
        const errMsg = resultItem.err?.message || resultItem.err?.toString() || 'unknown';
        console.log(`[PROC-ERR] ${resultItem.slug}: ${errMsg}`);
        apiErrors.push(`${resultItem.slug}(Fail: ${errMsg.substring(0, 50)})`);
        failedSlugs.add(resultItem.slug);
      }
    });

    return { failedSlugs, syncItems, idleItems, breakers, apiErrors, displayNameMap };
  }

  /**
   * 生成日志
   */
  generateLog(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta) {
    const isAnon = (!authContext || authContext.isAnonymous);
    const authSuffix = isAnon ? " 👻" : "";

    // 格式化项目信息
    const formatItem = (item) => `${item.displayName} ${this.formatDeltaTag(item)}`;

    const syncDetails = syncItems.map(formatItem);
    const idleDetails = idleItems.map(formatItem);

    let trafficLight, action, content;

    if (syncDetails.length === 0 && apiErrors.length === 0 && breakers.length === 0) {
      trafficLight = "⚪"; action = "[IDLE]";

      let parts = [];
      if (idleDetails.length > 0) parts.push(`🔍 ${idleDetails.join(", ")}`);

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

    const finalLog = `${trafficLight} ${action} | ${content}${authSuffix}`;
    if (trafficLight === "🔴") this.logger.error(finalLog); else this.logger.success(finalLog);
  }

  /**
   * 构建联赛级独立日志
   */
  buildLeagueLogEntries(syncItems, idleItems, breakers, apiErrors, authContext, analysis, runtimeConfig, oldTournamentMeta, displayNameMap) {
    const nowShort = dateUtils.getNow().shortDateTimeString;
    const isAnon = (!authContext || authContext.isAnonymous);
    const authSuffix = isAnon ? " 👻" : "";
    const bySlug = {};

    const getDisplayName = (slug) => displayNameMap?.get(slug) || slug;

    const pushEntry = (slug, level, message) => {
      if (!slug) return;
      bySlug[slug] = { timestamp: nowShort, level, message };
    };

    // 构建触发来源文本（与数据变动状态无关，仅标识来源）
    const buildTriggerSource = (item) => {
      if (item.revidChanges && item.revidChanges.length > 0) {
        const revInfo = item.revidChanges[0];
        return `<a href="${revInfo.diffUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${revInfo.revid}</a>`;
      }
      if (item.isForce) return "Force";
      return "";
    };

    // 有变动：🔄 + ➕
    syncItems.forEach(item => {
      const source = buildTriggerSource(item);
      const triggerText = source ? ` | ➕ ${source}` : "";
      pushEntry(item.slug, "SUCCESS", `🟢 [SYNC] | 🔄 ${getDisplayName(item.slug)} ${this.formatDeltaTag(item)}${triggerText}${authSuffix}`);
    });

    // 无变动：🔍 + 🟰
    idleItems.forEach(item => {
      if (bySlug[item.slug]) return;
      const source = buildTriggerSource(item);
      const triggerText = source ? ` | 🟰 ${source}` : "";
      pushEntry(item.slug, "SUCCESS", `⚪ [IDLE] | 🔍 ${getDisplayName(item.slug)} ~${item.added + item.updated}${triggerText}${authSuffix}`);
    });

    breakers.forEach(breaker => {
      const slug = String(breaker || "").split("(")[0];
      const dropInfo = String(breaker || "").match(/\(Drop .+\)/)?.[0] || "(Drop)";
      const name = getDisplayName(slug);
      pushEntry(slug, "ERROR", `🔴 [ERR!] | 🚧 ${name}${dropInfo}${authSuffix}`);
    });

    apiErrors.forEach(apiError => {
      const slug = String(apiError || "").split("(")[0];
      const name = getDisplayName(slug);
      pushEntry(slug, "ERROR", `🔴 [ERR!] | ❌ ${name}(Fail)${authSuffix}`);
    });

    return bySlug;
  }

  /**
   * 保存数据
   */
  async saveData(runtimeConfig, cache, analysis, syncItems, force = false, forceSlugs = null, leagueLogEntries = {}) {
    const previousTournamentsMeta = cache.meta?.tournaments || {};
    const analyzedTournamentsMeta = analysis.tournamentMeta || {};
    const changedTournamentMeta = {};
    let metaChanged = false;
    for (const [slug, nextMeta] of Object.entries(analyzedTournamentsMeta)) {
      const mergedForSlug = {
        ...(previousTournamentsMeta[slug] || {}),
        ...(nextMeta || {})
      };
      const hasSlugMetaChanged = !tournamentMetaEqual(previousTournamentsMeta[slug], mergedForSlug);
      if (!metaChanged && hasSlugMetaChanged) {
        metaChanged = true;
      }
      if (hasSlugMetaChanged) {
        changedTournamentMeta[slug] = mergedForSlug;
      }
    }
    const mergedMetaState = {
      tournaments: {
        ...previousTournamentsMeta,
        ...changedTournamentMeta
      },
      scheduleDayMark: cache.meta?.scheduleDayMark || null
    };

    if (metaChanged) {
      await writeMetaState(this.env, {
        tournamentMetaBySlug: changedTournamentMeta,
        scheduleDayMark: mergedMetaState.scheduleDayMark,
        activeSlugs: (runtimeConfig.TOURNAMENTS || []).map(tournament => tournament?.slug).filter(Boolean)
      });
      cache.meta = mergedMetaState;
    }

    // 保存首页静态HTML
    try {
      const homeFragment = HTMLRenderer.renderContentOnly(
        analysis.globalStats, analysis.timeGrid, analysis.scheduleMap,
        runtimeConfig, false, (analysis.tournamentMeta || {})
      );
      const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", this.env.GITHUB_TIME, this.env.GITHUB_SHA);
      const existingHomeHTML = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_STATIC_HTML);
      if (existingHomeHTML !== fullPage) {
        await kvPut(this.env, KV_KEYS.HOME_STATIC_HTML, fullPage);
      }
    } catch (error) {
      console.error("Error generating home HTML:", error);
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

    const changedSlugSet = new Set((syncItems || []).map(item => item?.slug).filter(Boolean));
    const writeScopeSlugSet = new Set(changedSlugSet);
    if (force) {
      if (forceSlugs && forceSlugs.size > 0) {
        for (const slug of forceSlugs) writeScopeSlugSet.add(slug);
      } else {
        for (const tournament of (runtimeConfig.TOURNAMENTS || [])) {
          if (tournament?.slug) writeScopeSlugSet.add(tournament.slug);
        }
      }
    }

    // 仅做 key-level existence 检查，避免读取所有 HOME_ JSON 带来的反序列化开销。
    const existingHomeList = await this.env["lol-stats-kv"].list({ prefix: KV_KEYS.HOME_PREFIX });
    const existingHomeKeySet = new Set(existingHomeList.keys.map(key => key.name));

    // 保存每个锦标赛的数据
    const writePromises = [];
    const writeTargets = [];
    for (const tournament of runtimeConfig.TOURNAMENTS) {
      const slug = tournament.slug;
      const isForceTarget = force && (!forceSlugs || forceSlugs.has(slug));
      const raw = cache.rawMatches[slug] || [];
      const stats = analysis.globalStats[slug] || {};
      const grid = analysis.timeGrid[slug] || {};

      const teamMap = tournament.teamMap || {};
      const { teamMap: _, ...tournamentStored } = tournament;

      const homeKey = KV_KEYS.HOME_PREFIX + slug;
      const homeSnapshot = {
        tournament: tournamentStored,
        rawMatches: raw,
        stats: stats,
        timeGrid: grid,
        scheduleMap: scheduleBySlug[slug] || {},
        teamMap: teamMap
      };

      const shouldBackfillMissing = !existingHomeKeySet.has(homeKey);
      const homeHasChanges = isForceTarget || writeScopeSlugSet.has(slug) || shouldBackfillMissing;

      if (homeHasChanges) {
        writeTargets.push({ key: homeKey, slug });
        writePromises.push(kvPut(this.env, homeKey, JSON.stringify(homeSnapshot)));
      }
    }

    const writeResults = await Promise.allSettled(writePromises);
    const failedWrites = writeResults.filter(r => r.status === 'rejected');
    const failedHomeSlugs = new Set();
    
    if (failedWrites.length > 0) {
      // 收集写入失败的 slug，供上游跳过 REV 提交
      writeResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const target = writeTargets[index];
          const key = target?.key || "UNKNOWN_HOME_KEY";
          if (key.startsWith(KV_KEYS.HOME_PREFIX)) {
            const slug = key.slice(KV_KEYS.HOME_PREFIX.length);
            failedHomeSlugs.add(slug);
          }
          console.error(`[KV-WRITE-FAIL] ${key}: ${result.reason?.message || result.reason}`);
        }
      });
    }

    // 联赛级日志写入独立键（LOG_<slug>），避免影响 HOME_ 写入规则
    const logEntries = leagueLogEntries || {};
    const logWrites = Object.entries(logEntries).map(async ([slug, entry]) => {
      if (!slug || !entry) return;
      const logKey = `LOG_${slug}`;
      const oldLogs = await this.env["lol-stats-kv"].get(logKey, { type: "json" }) || [];
      const nextLogs = [entry, ...oldLogs].slice(0, UPDATE_CONFIG.MAX_LOG_ENTRIES);
      await kvPut(this.env, logKey, JSON.stringify(nextLogs));
    });
    if (logWrites.length > 0) {
      const logResults = await Promise.allSettled(logWrites);
      const failedLogs = logResults.filter(r => r.status === 'rejected');
      if (failedLogs.length > 0) {
        console.error(`[KV] ${failedLogs.length} log write(s) failed:`, failedLogs.map(r => r.reason?.message || r.reason));
      }
    }

    // 只有有数据变化时才重新生成归档HTML
    if (syncItems.length > 0) {
      try {
        const archiveHTML = await this.generateArchiveStaticHTML();
        const existingArchiveHTML = await this.env["lol-stats-kv"].get(KV_KEYS.ARCHIVE_STATIC_HTML);
        if (existingArchiveHTML !== archiveHTML) {
          await kvPut(this.env, KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML);
        }
      } catch (error) {
        console.error("Error generating archive HTML:", error);
      }
    }

    return { failedHomeSlugs };
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
    const fullPage = HTMLRenderer.renderPageShell("LoL Stats", homeFragment, "home", this.env.GITHUB_TIME, this.env.GITHUB_SHA);
    const existingHomeHTML = await this.env["lol-stats-kv"].get(KV_KEYS.HOME_STATIC_HTML);
    const writePromises = [];
    let homeChanged = false;
    if (existingHomeHTML !== fullPage) {
      writePromises.push(kvPut(this.env, KV_KEYS.HOME_STATIC_HTML, fullPage));
      homeChanged = true;
    }

    let archiveChanged = false;
    if (includeArchive) {
      const archiveHTML = await this.generateArchiveStaticHTML();
      const existingArchiveHTML = await this.env["lol-stats-kv"].get(KV_KEYS.ARCHIVE_STATIC_HTML);
      if (existingArchiveHTML !== archiveHTML) {
        writePromises.push(kvPut(this.env, KV_KEYS.ARCHIVE_STATIC_HTML, archiveHTML));
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
        return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content arch-empty-msg">No archive data available.</div>`, "archive", this.env.GITHUB_TIME, this.env.GITHUB_SHA);
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

      return HTMLRenderer.renderPageShell("LoL Archive", `<div class="arch-content">${combined}</div>`, "archive", this.env.GITHUB_TIME, this.env.GITHUB_SHA);
    } catch (error) {
      return HTMLRenderer.renderPageShell("LoL Archive Error", `<div class="arch-error-msg">Error generating archive: ${error.message}</div>`, "archive", this.env.GITHUB_TIME, this.env.GITHUB_SHA);
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
