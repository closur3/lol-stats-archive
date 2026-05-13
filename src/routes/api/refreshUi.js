import { rebuildStaticPagesFromCache as rebuildStaticPages } from "../../core/updater/cacheRebuilder.js";
import { requireAdmin, requirePost } from "./auth.js";

async function rebuildStaticPagesForRefresh(env) {
  try {
    return await rebuildStaticPages(env, { includeArchive: true, requireData: true });
  } catch (error) {
    return { ok: false, reason: "ERROR", message: `Render Error: ${error.message}` };
  }
}

export async function handleRefreshUI(request, env) {
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const unauthorized = requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const result = await rebuildStaticPagesForRefresh(env);
  if (!result.ok) {
    const status = result.reason === "NO_CACHE" ? 400 : 500;
    return new Response(result.message, { status });
  }

  return new Response(
    `OK homes=${result.homes} writes=${result.writes} home=${result.homeChanged ? "updated" : "same"} archive=${result.archiveChanged ? "updated" : "same"}`,
    { status: 200 }
  );
}
