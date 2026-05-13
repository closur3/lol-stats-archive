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

export async function readPreviousRawMatches(env, slug) {
  if (!slug) throw new Error("previous rawMatches slug missing");
  const rawMatches = await env["lol-stats-kv"].get(kvKeys.rawMatches(slug), { type: "json" });
  if (rawMatches == null) return [];
  assertRawMatches(slug, rawMatches);
  return rawMatches;
}

export async function writeRawMatches(env, slug, rawMatches) {
  if (!slug) throw new Error("rawMatches slug missing");
  assertRawMatches(slug, rawMatches);
  await env["lol-stats-kv"].put(kvKeys.rawMatches(slug), JSON.stringify(rawMatches));
}

export async function readRawMatchesMap(env, tournaments) {
  const entries = await Promise.all((tournaments || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    return [slug, await readRawMatches(env, slug)];
  }));
  return Object.fromEntries(entries);
}

export async function readPreviousRawMatchesMap(env, tournaments) {
  const entries = await Promise.all((tournaments || []).map(async (tournament) => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");
    return [slug, await readPreviousRawMatches(env, slug)];
  }));
  return Object.fromEntries(entries);
}
