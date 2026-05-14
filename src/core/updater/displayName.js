export function buildDisplayNameMap(tournaments) {
  if (!Array.isArray(tournaments)) throw new Error("tournaments must be an array");
  return new Map(
    tournaments.map(t => [
      t.slug, t.league || t.name || t.slug.toUpperCase()
    ])
  );
}

export function getDisplayName(displayNameMap, slug) {
  return displayNameMap.get(slug) || slug;
}
