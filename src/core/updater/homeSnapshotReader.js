import { kvKeys } from '../../infrastructure/kv/keyFactory.js';

function assertHomeSnapshot(keyName, home) {
  if (!home || typeof home !== "object" || Array.isArray(home)) {
    throw new Error(`Invalid HOME snapshot: ${keyName}`);
  }
  if (!home.tournament || typeof home.tournament !== "object" || !home.tournament.slug) {
    throw new Error(`Invalid HOME tournament: ${keyName}`);
  }
  if (!home.stats || typeof home.stats !== "object" || Array.isArray(home.stats)) {
    throw new Error(`Invalid HOME stats: ${keyName}`);
  }
  if (!home.timeGrid || typeof home.timeGrid !== "object" || Array.isArray(home.timeGrid)) {
    throw new Error(`Invalid HOME timeGrid: ${keyName}`);
  }
  if (!home.scheduleMap || typeof home.scheduleMap !== "object" || Array.isArray(home.scheduleMap)) {
    throw new Error(`Invalid HOME scheduleMap: ${keyName}`);
  }
}

export async function readHomeEntries(env) {
  const kv = env["lol-stats-kv"];
  const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const dataKeys = allHomeKeys.keys.map(key => key.name);
  const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));
  return rawHomes.map((home, index) => {
    assertHomeSnapshot(dataKeys[index], home);
    return home;
  });
}
