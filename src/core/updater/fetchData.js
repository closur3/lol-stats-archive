export async function fetchMatchData(fandomClient, candidates) {
  if (!Array.isArray(candidates)) throw new Error("candidates must be an array");
  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      if (!candidate || typeof candidate !== "object" || !candidate.slug) {
        throw new Error("Invalid fetch candidate");
      }
      const fetchedMatches = await fandomClient.fetchAllMatches(candidate.slug, candidate.overview_page, null);
      return { slug: candidate.slug, data: fetchedMatches };
    })
  );

  return results.map((result, index) => {
    const slug = candidates[index].slug;
    if (result.status === 'fulfilled') {
      if (!Array.isArray(result.value.data)) throw new Error(`Fetched data must be an array: ${slug}`);
      return { status: 'fulfilled', slug, data: result.value.data };
    } else {
      return { status: 'rejected', slug, err: result.reason };
    }
  });
}
