import { FandomClient } from '../../api/fandomClient.js';
import { kvKeys } from '../../infrastructure/kv/keyFactory.js';
import { dataUtils } from '../../utils/dataUtils.js';

export function hasRevisionRecordChanged(previousRecord, nextRecord) {
  const prev = previousRecord || {};
  const next = nextRecord || {};
  if ((prev.slug || "") !== (next.slug || "")) return true;

  const prevPages = prev.pages && typeof prev.pages === "object" ? prev.pages : {};
  const nextPages = next.pages && typeof next.pages === "object" ? next.pages : {};
  const prevTitles = Object.keys(prevPages);
  const nextTitles = Object.keys(nextPages);
  if (prevTitles.length !== nextTitles.length) return true;

  for (const title of prevTitles) {
    if (!Object.prototype.hasOwnProperty.call(nextPages, title)) return true;
    const prevPage = prevPages[title] || {};
    const nextPage = nextPages[title] || {};
    if ((Number(prevPage.revid) || 0) !== (Number(nextPage.revid) || 0)) return true;
    if ((prevPage.timestamp || "") !== (nextPage.timestamp || "")) return true;
    if ((Number(prevPage.pageid) || 0) !== (Number(nextPage.pageid) || 0)) return true;
  }
  return false;
}

export async function detectRevisionChanges(env, tournaments) {
  const changedSlugs = new Set();
  const revidChanges = {};
  const pendingRevisionWrites = {};
  let hasErrors = false;
  let checkedSlugs = 0;

  const revisionChecks = await Promise.all(
    (tournaments || []).map(async (tournament) => {
      const slug = tournament?.slug;
      if (!slug) return null;

      const pages = dataUtils.normalizeOverviewPages(tournament.overview_page);
      if (pages.length === 0) return null;

      const dataPages = Array.from(new Set(pages.map(dataUtils.toDataPage)));
      const expandedDataPages = [];
      for (const dataPage of dataPages) {
        try {
          const subpages = await FandomClient.fetchAllSubpages(dataPage);
          expandedDataPages.push(...subpages);
        } catch (error) {
          console.log(`[REV] ${slug}: failed to fetch subpages for ${dataPage}: ${error.message}`);
          expandedDataPages.push(dataPage);
        }
      }

      const finalDataPages = Array.from(new Set(expandedDataPages));
      const kv = env["lol-stats-kv"];
      const revKey = kvKeys.rev(slug);
      const previousRevisionState = await kv.get(revKey, { type: "json" });
      const shouldSkip = false;
      console.log(`[REV-CHECK] ${slug} -> check`);

      return {
        slug,
        dataPages: finalDataPages,
        previousRevisionState,
        shouldSkip,
        tournament
      };
    })
  );

  const revChecks = await Promise.allSettled(
    revisionChecks
      .filter(check => check && !check.shouldSkip)
      .map(async (check) => {
        const { slug, dataPages, previousRevisionState } = check;
        checkedSlugs++;

        const prevPages = previousRevisionState?.pages || {};
        const nextPages = {};
        let revisionChanged = false;
        let pagesFetched = 0;
        let errCount = 0;
        const changedPages = [];

        const pageResults = await Promise.allSettled(
          dataPages.map(async (page) => {
            const latest = await FandomClient.fetchLatestRevision(page);
            return { page, latest };
          })
        );

        for (const pageResult of pageResults) {
          if (pageResult.status === 'rejected') {
            errCount++;
            console.log(`[REV] ${slug}: ${pageResult.reason?.message || 'unknown error'}`);
            continue;
          }

          const { page, latest } = pageResult.value;
          if (latest?.missing) continue;

          const title = latest.title || page;
          pagesFetched++;
          nextPages[title] = {
            revid: latest.revid,
            timestamp: latest.timestamp,
            pageid: latest.pageid
          };

          const prevRev = prevPages?.[title]?.revid;
          if (!prevRev || Number(prevRev) !== Number(latest.revid)) {
            revisionChanged = true;
            changedPages.push(`${title}:${prevRev || "none"}->${latest.revid}`);

            const safeTitle = title.replace(/ /g, '_');
            const diffUrl = `https://lol.fandom.com/wiki/${safeTitle}?diff=prev&oldid=${latest.revid}`;
            if (!revidChanges[slug]) revidChanges[slug] = [];
            revidChanges[slug].push({ revid: latest.revid, diffUrl, title });
          }
        }

        if (errCount > 0 && pagesFetched === 0) hasErrors = true;

        const nextRecord = { slug, pages: nextPages || {} };
        const shouldWriteRev = hasRevisionRecordChanged(
          { slug, pages: prevPages || {} },
          nextRecord
        );

        return {
          slug,
          shouldWriteRev,
          nextRecord,
          pagesFetched,
          revisionChanged,
          errCount,
          changedPages
        };
      })
  );

  for (const checkResult of revChecks) {
    if (checkResult.status === 'rejected') {
      hasErrors = true;
      console.log(`[REV] check failed: ${checkResult.reason?.message || 'unknown error'}`);
      continue;
    }

    const { slug, shouldWriteRev, nextRecord, pagesFetched, revisionChanged, errCount, changedPages } = checkResult.value;

    if (shouldWriteRev && pagesFetched > 0) {
      pendingRevisionWrites[slug] = nextRecord;
    }

    if (revisionChanged) {
      changedSlugs.add(slug);
      console.log(`[REV] ${slug}: changed pages=${changedPages.length}${changedPages.length ? ` | ${changedPages.join(", ")}` : ""}`);
    } else if (errCount > 0) {
      console.log(`[REV] ${slug}: partial errors ok=${pagesFetched} err=${errCount}`);
    }
  }

  return { changedSlugs, revidChanges, pendingRevisionWrites, hasErrors, checkedSlugs };
}
