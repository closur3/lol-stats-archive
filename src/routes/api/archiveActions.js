import { FandomClient } from "../../api/fandomClient.js";
import { GitHubClient } from "../../api/githubClient.js";
import { rebuildArchiveIndexFromSnapshots, removeArchiveIndex } from "../../core/updater/archiveIndex.js";
import { loadTeamsConfig } from "../../core/updater/teamsConfigLoader.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { dataUtils } from "../../utils/dataUtils.js";
import { kvDelete, kvPutIfChanged } from "../../utils/kvStore.js";
import { requireAdmin, requirePost } from "./auth.js";
import { generateArchiveStaticHTML } from "./staticPages.js";

function normalizeArchivePayload(payload, parser) {
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const league = typeof payload.league === "string" ? payload.league.trim() : "";
  const startDate = typeof payload.start_date === "string" ? payload.start_date.trim() : "";
  const endDate = typeof payload.end_date === "string" ? payload.end_date.trim() : "";
  const overviewPages = parser(payload.overview_page);
  return { slug, name, league, startDate, endDate, overviewPages };
}

function assertArchivePayload(payload) {
  if (!payload.slug || !payload.name || !payload.league || !payload.startDate || !payload.endDate || payload.overviewPages.length === 0) {
    return new Response("Missing required fields. Please provide slug, name, overview_page, league, start_date, and end_date.", { status: 400 });
  }
  return null;
}

async function readJsonPayload(request) {
  try {
    return await request.json();
  } catch (_error) {
    return null;
  }
}

export async function handleRebuildArchive(request, env) {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const rawPayload = await readJsonPayload(request);
  if (!rawPayload) return new Response("Invalid JSON payload", { status: 400 });
  const payload = normalizeArchivePayload(rawPayload, dataUtils.normalizeOverviewPages);
  const payloadError = assertArchivePayload(payload);
  if (payloadError) return payloadError;

  try {
    const authContext = await FandomClient.login(env.FANDOM_BOT_USERNAME, env.FANDOM_BOT_PASSWORD);
    const fandomClient = new FandomClient(authContext);
    const githubClient = new GitHubClient(env);

    let teamsRaw = null;
    try {
      teamsRaw = await loadTeamsConfig(env, githubClient);
    } catch (error) { console.error("[Rebuild] Failed to load teams.json:", error.message); }

    const matches = await fandomClient.fetchAllMatches(payload.slug, payload.overviewPages, null);
    if (!matches || matches.length === 0) throw new Error("No matches found from Fandom API");

    const tournament = {
      slug: payload.slug,
      name: payload.name,
      overview_page: payload.overviewPages,
      league: payload.league,
      start_date: payload.startDate,
      end_date: payload.endDate
    };
    const teamMap = dataUtils.pickTeamMap(teamsRaw, tournament, matches);
    await kvPutIfChanged(env, kvKeys.archive(payload.slug), { tournament, rawMatches: matches, teamMap });
    await rebuildArchiveIndexFromSnapshots(env);

    const archiveHTML = await generateArchiveStaticHTML(env);
    await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

export async function handleDeleteArchive(request, env) {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const payload = await readJsonPayload(request);
  if (!payload) return new Response("Invalid JSON payload", { status: 400 });
  if (!payload.slug || !payload.name) return new Response("Missing required fields: slug, name", { status: 400 });

  try {
    await kvDelete(env, kvKeys.archive(payload.slug));
    const githubClient = new GitHubClient(env);
    await removeArchiveIndex(env, githubClient, payload.slug);
    const archiveHTML = await generateArchiveStaticHTML(env);
    await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(`Delete Error: ${error.message}`, { status: 500 });
  }
}

export async function handleManualArchive(request, env) {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const rawPayload = await readJsonPayload(request);
  if (!rawPayload) return new Response("Invalid JSON payload", { status: 400 });
  const payload = normalizeArchivePayload(rawPayload, dataUtils.parseOverviewPages);
  const payloadError = assertArchivePayload(payload);
  if (payloadError) return payloadError;

  try {
    const snapshot = {
      tournament: {
        slug: payload.slug,
        name: payload.name,
        overview_page: payload.overviewPages,
        league: payload.league,
        start_date: payload.startDate,
        end_date: payload.endDate
      },
      rawMatches: [],
      teamMap: {}
    };

    await kvPutIfChanged(env, kvKeys.archive(payload.slug), snapshot);
    await rebuildArchiveIndexFromSnapshots(env);
    const archiveHTML = await generateArchiveStaticHTML(env);
    await kvPutIfChanged(env, kvKeys.archiveStatic(), archiveHTML);
    return new Response("OK", { status: 200 });
  } catch (error) {
    return new Response(`Save Error: ${error.message}`, { status: 500 });
  }
}
