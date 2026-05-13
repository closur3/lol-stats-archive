import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged, kvDelete } from '../../utils/kvStore.js';
import { rebuildArchiveIndexFromSnapshots } from './archiveIndex.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';

export async function cleanupStaleHomeKeys(env, runtimeConfig) {
  const kv = env["lol-stats-kv"];
  const [allHomeKeys, allLogKeys, allRevKeys, allRawMatchesKeys, allScheduleMetaKeys] = await Promise.all([
    kv.list({ prefix: kvKeys.HOME_PREFIX }),
    kv.list({ prefix: kvKeys.LOG_PREFIX }),
    kv.list({ prefix: kvKeys.REV_PREFIX }),
    kv.list({ prefix: kvKeys.RAW_MATCHES_PREFIX }),
    kv.list({ prefix: kvKeys.SCHEDULE_META_PREFIX })
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

  const staleRawMatchesKeys = allRawMatchesKeys.keys
    .map(key => key.name)
    .filter(keyName => !activeSlugs.has(keyName.slice(kvKeys.RAW_MATCHES_PREFIX.length)));

  const staleScheduleMetaKeys = allScheduleMetaKeys.keys
    .map(key => key.name)
    .filter(keyName => !activeSlugs.has(keyName.slice(kvKeys.SCHEDULE_META_PREFIX.length)));

  if (staleHomeKeys.length > 0) {
    const staleData = await Promise.all(
      staleHomeKeys.map(k => env["lol-stats-kv"].get(k, { type: "json" }))
    );

    const archiveWrites = staleHomeKeys.map((k, i) => {
      if (staleData[i]) {
        const archiveSnapshot = { ...staleData[i] };
        delete archiveSnapshot.scheduleMap;
        return kvPutIfChanged(env, kvKeys.archive(k.slice(kvKeys.HOME_PREFIX.length)), archiveSnapshot);
      }
      return Promise.resolve();
    });
    await Promise.all(archiveWrites);
    await rebuildArchiveIndexFromSnapshots(env);
    console.log(`[ARCHIVE:MOVE] moved=${staleHomeKeys.length}`);
  }

  if (staleHomeKeys.length > 0 || staleLogKeys.length > 0 || staleRevKeys.length > 0 || staleRawMatchesKeys.length > 0 || staleScheduleMetaKeys.length > 0) {
    await Promise.all([
      ...staleHomeKeys.map(key => kvDelete(env, key)),
      ...staleLogKeys.map(key => kvDelete(env, key)),
      ...staleRevKeys.map(key => kvDelete(env, key)),
      ...staleRawMatchesKeys.map(key => kvDelete(env, key)),
      ...staleScheduleMetaKeys.map(key => kvDelete(env, key))
    ]);
  }

  if (staleHomeKeys.length > 0) {
    const archiveHTML = await generateArchiveStaticHTML(env);
    await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
    console.log(`[ARCHIVE:STATIC] refreshed`);
  }
}
