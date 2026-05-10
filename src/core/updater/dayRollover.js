import { dateUtils } from '../../utils/dateUtils.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { kvPutIfChanged } from '../../utils/kvStore.js';

export async function refreshScheduleBoardOnDayRollover(env, runtimeConfig, cleanupStaleHomeKeys, refreshHomeStaticFromCache) {
  const kv = env["lol-stats-kv"];
  const today = dateUtils.getNow().dateString;
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state != null && (typeof state !== "object" || Array.isArray(state))) {
    throw new Error("SCHEDULE_DAY must be a JSON object");
  }
  const lastDay = state?.date || null;
  if (lastDay === today) return;

  await cleanupStaleHomeKeys(env, runtimeConfig);
  await refreshHomeStaticFromCache(env);

  await kvPutIfChanged(env, kvKeys.scheduleDay(), {
    date: today,
    leagues: Object.fromEntries((runtimeConfig.TOURNAMENTS || []).map(tournament => {
      if (!tournament?.slug) throw new Error("Tournament slug missing");
      return [tournament.slug, {
        phase: "idle",
        playCron: null,
        playStartHour: null,
        playEndHour: null,
        tailCron1: null,
        tailCron2: null
      }];
    }))
  });
  console.log(`[SCHEDULE] ${lastDay || "none"} -> ${today}`);
}
