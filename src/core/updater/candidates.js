export function determineCandidates(tournaments, forceSlugs = null) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  const candidates = [];
  const hasScope = !!(forceSlugs && forceSlugs.size > 0);

  tournaments.forEach(tournament => {
    const slug = tournament?.slug;
    if (!slug) throw new Error("Tournament slug missing");

    if (hasScope && !forceSlugs.has(slug)) {
      return;
    }

    candidates.push({
      slug,
      overview_page: tournament.overview_page,
      league: tournament.league,
      start_date: tournament.start_date
    });
  });

  return candidates;
}
