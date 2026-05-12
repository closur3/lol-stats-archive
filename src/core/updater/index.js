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

export class Updater {
  constructor(env) {
    this.env = env;
    this.githubClient = new GitHubClient(env);
    this.logger = new Logger();
  }

  async loadRuntimeConfig() {
    return loadRuntimeConfig(this.env, this.githubClient);
  }

  async loadCachedData(tournaments) {
    return loadCachedData(this.env, tournaments);
  }

  async runScheduledUpdate(scopeSlugs = null) {
    const startedAt = Date.now();
    let runtimeConfig;
    try {
      runtimeConfig = await this.loadRuntimeConfig();
    } catch (error) {
      this.logger.error(`🔴 [ERR!] | ❌ Config(Fail): ${error.message}`);
      throw error;
    }

    await refreshScheduleBoardOnDayRollover(this.env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache);

    const hasScope = scopeSlugs instanceof Set;
    if (hasScope && scopeSlugs.size === 0) {
      console.log("[UPDATE:SCOPE] empty high-frequency scope, skipped updater");
      return this.logger;
    }

    const cache = await this.loadCachedData(runtimeConfig.TOURNAMENTS);
    const scopedTournaments = hasScope
      ? (runtimeConfig.TOURNAMENTS || []).filter(tournament => scopeSlugs.has(tournament.slug))
      : (runtimeConfig.TOURNAMENTS || []);
    const { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs } = await detectRevisionChanges(this.env, scopedTournaments);
    console.log(`[UPDATE:REV] checked=${checkedSlugs} changed=${changedSlugs.size} errors=${hasErrors ? 1 : 0} elapsedMs=${Date.now() - startedAt}`);
    const targetSlugs = new Set(changedSlugs);
    const checkedSlugSet = new Set(scopedTournaments.map(tournament => tournament.slug));
    const unchangedSlugs = new Set([...checkedSlugSet].filter(slug => !targetSlugs.has(slug)));

    if (targetSlugs.size === 0) {
      console.log("[UPDATE:GATE] no revision changes, running local update");
      await commitRevisionWrites(this.env, pendingRevisionWrites);
      await runLocalUpdateFn(this.env, this.githubClient, runtimeConfig, cache, refreshHomeStaticFromCache, scopeSlugs);
      return this.logger;
    }

    console.log(`[UPDATE:GATE] fandom slugs=${Array.from(targetSlugs).join(", ")}`);
    await runFandomUpdateFn(this.env, this.githubClient, runtimeConfig, cache, false, targetSlugs, {
      forceWrite: false,
      revidChanges: revidChanges,
      pendingRevisionWrites
    }, this.logger);
    if (unchangedSlugs.size > 0) {
      console.log(`[UPDATE:GATE] local slugs=${Array.from(unchangedSlugs).join(", ")}`);
      await runLocalUpdateFn(this.env, this.githubClient, runtimeConfig, cache, refreshHomeStaticFromCache, unchangedSlugs);
    }
    return this.logger;
  }

  async runFandomUpdate(runtimeConfig, cache, force = false, forceSlugs = null, options = {}) {
    await runFandomUpdateFn(this.env, this.githubClient, runtimeConfig, cache, force, forceSlugs, options, this.logger);
  }

  async refreshScheduleBoardOnDayRollover(runtimeConfig) {
    return refreshScheduleBoardOnDayRollover(this.env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache);
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

  getMaxScheduleDays() {
    return UPDATE_CONFIG.MAX_SCHEDULE_DAYS;
  }
}
