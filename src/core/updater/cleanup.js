import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged, kvDelete } from '../../utils/kvStore.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';

export async function cleanupStaleHomeKeys(env, runtimeConfig) {
  const kv = env["lol-stats-kv"];
  try {
    const [allHomeKeys, allLogKeys, allRevKeys] = await Promise.all([
      kv.list({ prefix: kvKeys.HOME_PREFIX }),
      kv.list({ prefix: kvKeys.LOG_PREFIX }),
      kv.list({ prefix: kvKeys.REV_PREFIX })
    ]);

    const activeSlugs = new Set((runtimeConfig.TOURNAMENTS || []).map(tournament => tournament.slug));

    const staleHomeKeys = allHomeKeys.keys
      .map(key => key.name)
      .filter(keyName => keyName !== kvKeys.homeStatic() && !activeSlugs.has(keyName.slice(kvKeys.HOME_PREFIX.length)));

    const staleLogKeys = allLogKeys.keys
      .map(key => key.name)
      .filter(keyName => !activeSlugs.has(keyName.slice(kvKeys.LOG_PREFIX.length)));

    const staleRevKeys = allRevKeys.keys
      .map(key => key.name)
      .filter(keyName => !activeSlugs.has(keyName.slice(kvKeys.REV_PREFIX.length)));

    if (staleHomeKeys.length > 0) {
      const staleData = await Promise.all(
        staleHomeKeys.map(k => env["lol-stats-kv"].get(k, { type: "json" }))
      );

      const archiveWrites = staleHomeKeys.map((k, i) => {
        if (staleData[i]) {
          return kvPutIfChanged(env, `ARCHIVE_${k.slice(kvKeys.HOME_PREFIX.length)}`, staleData[i]);
        }
        return Promise.resolve();
      });
      await Promise.all(archiveWrites);
      console.log(`[ARCHIVE-MOVE] Moved ${staleHomeKeys.length} expired slugs to archive`);
    }

    if (staleHomeKeys.length > 0 || staleLogKeys.length > 0 || staleRevKeys.length > 0) {
      await Promise.all([
        ...staleHomeKeys.map(key => kvDelete(env, key)),
        ...staleLogKeys.map(key => kvDelete(env, key)),
        ...staleRevKeys.map(key => kvDelete(env, key))
      ]);
    }

    if (staleHomeKeys.length > 0) {
      try {
        const archiveHTML = await generateArchiveStaticHTML(env);
        await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
        console.log(`[ARCHIVE] Refreshed static HTML`);
      } catch (error) {
        console.error(`[ARCHIVE] Refresh failed: ${error.message}`);
      }
    }

  } catch (error) { console.error("[Cleanup] Failed to cleanup stale home keys:", error.message); }
}