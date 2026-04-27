import { GitHubClient } from '../../api/githubClient.js';
import { Logger } from '../../infrastructure/logger.js';
import { loadRuntimeConfig } from './configLoader.js';
import { loadCachedData } from './cache.js';
import { detectRevisionChanges } from './revisionDetector.js';
import { runFandomUpdate as runFandomUpdateFn } from './fandomSync.js';
import { runLocalUpdate as runLocalUpdateFn } from './localUpdate.js';
import { commitRevisionWrites } from './revWriter.js';
import { cleanupStaleHomeKeys } from './cleanup.js';
import { refreshHomeStaticFromCache, rebuildStaticPagesFromCache } from './cacheRebuilder.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';
import { refreshScheduleBoardOnDayRollover } from './dayRollover.js';
import { UPDATE_CONFIG } from './types.js';

export { UPDATE_CONFIG };
export { formatLogEntry } from './logWriter.js';

export class Updater {
  constructor(env) {
    this.env = env;
    this.githubClient = new GitHubClient(env);
    this.logger = new Logger();
  }

  async loadRuntimeConfig() {
    return loadRuntimeConfig(this.githubClient);
  }

  async loadCachedData(tournaments) {
    return loadCachedData(this.env, tournaments);
  }

  async runScheduledUpdate() {
    const startedAt = Date.now();
    let runtimeConfig;
    try {
      runtimeConfig = await this.loadRuntimeConfig();
    } catch (error) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail): ${error.message}`);
      return this.logger;
    }

    await refreshScheduleBoardOnDayRollover(this.env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache);

    const NOW = Date.now();
    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    const slowThresholdMs = UPDATE_CONFIG.SLOW_THRESHOLD_MINUTES * 60 * 1000;
    const { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs, thresholdSkippedSlugs } = await detectRevisionChanges(this.env, runtimeConfig.TOURNAMENTS || [], cache, NOW, slowThresholdMs);
    console.log(`[CRON] rev-check checked=${checkedSlugs} th-skip=${thresholdSkippedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0} elapsedMs=${Date.now() - startedAt}`);
    const targetSlugs = new Set(changedSlugs);

    if (targetSlugs.size === 0) {
      console.log("[REV-GATE] No revision changes, running local update");
      await commitRevisionWrites(this.env, pendingRevisionWrites);
      await runLocalUpdateFn(this.env, this.githubClient, runtimeConfig, cache, refreshHomeStaticFromCache);
      return this.logger;
    }

    console.log(`[REV-GATE] Target slugs: ${Array.from(targetSlugs).join(", ")}`);
    await runFandomUpdateFn(this.env, this.githubClient, runtimeConfig, cache, false, targetSlugs, {
      forceWrite: false,
      revidChanges: revidChanges,
      pendingRevisionWrites
    }, this.logger);
    return this.logger;
  }

  async runFandomUpdate(runtimeConfig, cache, force = false, forceSlugs = null, options = {}) {
    await runFandomUpdateFn(this.env, this.githubClient, runtimeConfig, cache, force, forceSlugs, options, this.logger);
  }

  async cleanupStaleHomeKeys(runtimeConfig) {
    return cleanupStaleHomeKeys(this.env, runtimeConfig);
  }

  async generateArchiveStaticHTML() {
    return generateArchiveStaticHTML(this.env);
  }

  async refreshHomeStaticFromCache() {
    return refreshHomeStaticFromCache(this.env);
  }

  async rebuildStaticPagesFromCache(options = {}) {
    return rebuildStaticPagesFromCache(this.env, options);
  }

  getSlowThresholdMs() {
    return UPDATE_CONFIG.SLOW_THRESHOLD_MINUTES * 60 * 1000;
  }

  getMaxScheduleDays() {
    return UPDATE_CONFIG.MAX_SCHEDULE_DAYS;
  }
}