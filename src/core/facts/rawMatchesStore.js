import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

function assertRawMatches(slug, rawMatches) {
  if (!Array.isArray(rawMatches)) {
    throw new Error(`RAW_MATCHES must be an array: ${slug}`);
  }
}

export async function readRawMatches(env, slug) {
  if (!slug) throw new Error("rawMatches slug missing");
  const rawMatches = await env["lol-stats-kv"].get(kvKeys.rawMatches(slug), { type: "json" });
  if (rawMatches == null) throw new Error(`RAW_MATCHES missing: ${slug}`);
  assertRawMatches(slug, rawMatches);
  return rawMatches;
}

export async function writeRawMatches(env, slug, rawMatches) {
  if (!slug) throw new Error("rawMatches slug missing");
  assertRawMatches(slug, rawMatches);
  await env["lol-stats-kv"].put(kvKeys.rawMatches(slug), JSON.stringify(rawMatches));
}

export async function readRawMatchesMap(env, tournaments, options = {}) {
  const allowMissingSlugs = options.allowMissingSlugs || new Set();
  const entries = await Promise.all((tournaments || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    const rawMatches = await env["lol-stats-kv"].get(kvKeys.rawMatches(slug), { type: "json" });
    if (rawMatches == null) {
      if (allowMissingSlugs.has(slug)) return [slug, []];
      throw new Error(`RAW_MATCHES missing: ${slug}`);
    }
    assertRawMatches(slug, rawMatches);
    return [slug, rawMatches];
  }));
  return Object.fromEntries(entries);
}
