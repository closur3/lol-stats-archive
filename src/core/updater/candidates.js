export function determineCandidates(tournaments, forceSlugs = null) {
  const candidates = [];
  const hasScope = !!(forceSlugs && forceSlugs.size > 0);

  tournaments.forEach(tournament => {
    const slug = tournament?.slug;
    if (!slug) return;

    if (hasScope && !forceSlugs.has(slug)) {
      return;
    }

    candidates.push({
      slug,
      overview_page: tournament.overview_page,
      league: tournament.league,
      start_date: tournament.start_date || null
    });
  });

  return candidates;
}