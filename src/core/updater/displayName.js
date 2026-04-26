export function buildDisplayNameMap(tournaments) {
  return new Map(
    (tournaments || []).map(t => [
      t.slug, t.league || t.name || t.slug.toUpperCase()
    ])
  );
}

export function getDisplayName(displayNameMap, slug) {
  return displayNameMap.get(slug) || slug;
}