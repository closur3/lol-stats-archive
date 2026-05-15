import { timePolicy } from '../../utils/timePolicy.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { cleanupStaleHomeKeys } from './cleanup.js';
import { renderCache } from '../../cache/renderCache.js';
import { rebuildScheduleMetaFromRawMatches } from '../facts/scheduleMetaStore.js';

export async function refreshScheduleBoardOnDayRollover(env, runtimeConfig, scheduledTimeMs = Date.now()) {
  const kv = env["lol-stats-kv"];
  const today = timePolicy.getNow(scheduledTimeMs).dateString;
  const state = await kv.get(kvKeys.scheduleDay(), { type: "json" });
  if (state != null && (typeof state !== "object" || Array.isArray(state))) {
    throw new Error("SCHEDULE_DAY must be a JSON object");
  }
  const lastDay = state?.date || null;
  if (lastDay === today) return;

  if (!Array.isArray(runtimeConfig.TOURNAMENTS)) {
    throw new Error("runtimeConfig.TOURNAMENTS must be an array");
  }

  await Promise.all(
    runtimeConfig.TOURNAMENTS.map(async (tournament) => {
      const slug = tournament?.slug;
      if (!slug) throw new Error("Tournament slug missing");
      await rebuildScheduleMetaFromRawMatches(env, slug);
    })
  );

  await cleanupStaleHomeKeys(env, runtimeConfig);
  renderCache.invalidateAll();

  console.log(`[SCHED:DAY] ${lastDay || "none"} -> ${today}`);
}
