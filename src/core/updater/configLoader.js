export async function loadRuntimeConfig(githubClient) {
  const tournaments = await githubClient.fetchJson("config/tour.json");
  return { TOURNAMENTS: tournaments };
}