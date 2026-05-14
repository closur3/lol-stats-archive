import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged, kvDelete } from '../../utils/kvStore.js';
import { rebuildArchiveIndexFromSnapshots } from './archiveIndex.js';
import { generateArchiveStaticHTML } from './archiveBuilder.js';

export async function cleanupStaleHomeKeys(env, runtimeConfig) {
  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }
  const kv = env["lol-stats-kv"];
  const [allHomeKeys, allLogKeys, allRevKeys, allRawMatchesKeys, allScheduleMetaKeys] = await Promise.all([
    kv.list({ prefix: kvKeys.HOME_PREFIX }),
    kv.list({ prefix: kvKeys.LOG_PREFIX }),
    kv.list({ prefix: kvKeys.REV_PREFIX }),
    kv.list({ prefix: kvKeys.RAW_MATCHES_PREFIX }),
    kv.list({ prefix: kvKeys.SCHEDULE_META_PREFIX })
  ]);

  const activeSlugs = new Set(runtimeConfig.TOURNAMENTS.map(tournament => {
    if (!tournament?.slug) throw new Error("Tournament slug missing");
    return tournament.slug;
  }));

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
    const staleData = await Promise.all(staleHomeKeys.map(async keyName => {
      const slug = keyName.slice(kvKeys.HOME_PREFIX.length);
      const [home, rawMatches] = await Promise.all([
        env["lol-stats-kv"].get(keyName, { type: "json" }),
        env["lol-stats-kv"].get(kvKeys.rawMatches(slug), { type: "json" })
      ]);
      if (!home || typeof home !== "object" || Array.isArray(home)) {
        throw new Error(`Invalid HOME snapshot for archive move: ${slug}`);
      }
      if (!Array.isArray(rawMatches)) throw new Error(`RAW_MATCHES missing for archive move: ${slug}`);
      return { ...home, rawMatches };
    }));

    const archiveWrites = staleHomeKeys.map((k, i) => {
      const archiveSnapshot = { ...staleData[i] };
      delete archiveSnapshot.scheduleMap;
      return kvPutIfChanged(env, kvKeys.archive(k.slice(kvKeys.HOME_PREFIX.length)), archiveSnapshot);
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
