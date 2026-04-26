export async function loadRuntimeConfig(githubClient) {
  try {
    const tournaments = await githubClient.fetchJson("config/tour.json");
    if (tournaments) return { TOURNAMENTS: tournaments };
  } catch (error) { console.error("[Config] Failed to load runtime config:", error.message); }
  return null;
}