import { kvKeys } from "../../infrastructure/kv/keyFactory.js";

function normalizeTournamentConfig(tournament) {
  if (!tournament || typeof tournament !== "object" || Array.isArray(tournament)) {
    throw new Error("config/tour.json tournament must be object");
  }
  const slug = typeof tournament.slug === "string" ? tournament.slug.trim() : "";
  const name = typeof tournament.name === "string" ? tournament.name.trim() : "";
  const league = typeof tournament.league === "string" ? tournament.league.trim() : "";
  const startDate = typeof tournament.start_date === "string" ? tournament.start_date.trim() : "";
  const endDate = typeof tournament.end_date === "string" ? tournament.end_date.trim() : "";
  const overviewPage = Array.isArray(tournament.overview_page)
    ? tournament.overview_page.filter(page => typeof page === "string" && page.trim()).map(page => page.trim())
    : [];
  if (!slug || !name || !league || !startDate || !endDate || overviewPage.length === 0) {
    throw new Error(`Invalid tournament config: ${slug || "(missing slug)"}`);
  }
  return { ...tournament, slug, name, league, overview_page: overviewPage, start_date: startDate, end_date: endDate };
}

function normalizeTourConfig(tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("config/tour.json must be array");
  return tournaments.map(normalizeTournamentConfig);
}

export async function loadTourConfig(env, githubClient) {
  const kv = env["lol-stats-kv"];
  const cached = await kv.get(kvKeys.configTour(), { type: "json" });
  if (cached != null) return normalizeTourConfig(cached);

  const tournaments = await githubClient.fetchJson("config/tour.json");
  const normalized = normalizeTourConfig(tournaments);
  await kv.put(kvKeys.configTour(), JSON.stringify(normalized));
  return normalized;
}
