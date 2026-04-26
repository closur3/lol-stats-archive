export async function fetchMatchData(fandomClient, candidates) {
  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const fetchedMatches = await fandomClient.fetchAllMatches(candidate.slug, candidate.overview_page, null);
      return { slug: candidate.slug, data: fetchedMatches };
    })
  );

  return results.map((result, index) => {
    const slug = candidates[index].slug;
    if (result.status === 'fulfilled') {
      return { status: 'fulfilled', slug, data: result.value.data };
    } else {
      return { status: 'rejected', slug, err: result.reason };
    }
  });
}