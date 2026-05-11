import { HTMLRenderer } from "../../render/htmlRenderer.js";
import { readArchiveIndex } from "../../core/updater/archiveIndex.js";
import { kvKeys } from "../../infrastructure/kv/keyFactory.js";
import { requireAdmin } from "./auth.js";

export async function handleBackup(request, env) {
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const payload = {};
  const kv = env["lol-stats-kv"];
  const allHomeKeys = await kv.list({ prefix: kvKeys.HOME_PREFIX });
  const dataKeys = allHomeKeys.keys.map(key => key.name).filter(keyName => keyName !== kvKeys.homeStatic());
  const rawHomes = await Promise.all(dataKeys.map(key => env["lol-stats-kv"].get(key, { type: "json" })));

  rawHomes.forEach((home, index) => {
    const homeTournament = home?.tournament;
    if (!home || !homeTournament || !homeTournament.slug || !home.stats || !home.timeGrid) {
      throw new Error(`Invalid HOME snapshot: ${dataKeys[index]}`);
    }
    const slug = homeTournament.slug;
    payload[`markdown/${slug}.md`] = HTMLRenderer.generateMarkdown(
      homeTournament,
      home.stats,
      { [slug]: home.timeGrid }
    );
  });

  const archivedTournaments = await readArchiveIndex(env);
  payload["config/archive.json"] = `${JSON.stringify(archivedTournaments, null, 2)}\n`;

  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" }
  });
}
