import { FETCH_DELAY_MS, FANDOM_API } from '../../constants/index.js';
import { assertCargoDate, cargoStringLiteral } from './cargoQuery.js';

export async function fetchAllMatches(fandomClient, slug, sourceInput, dateFilter = null) {
  const pages = Array.isArray(sourceInput) ? sourceInput : [sourceInput];
  if (pages.length === 0) throw new Error(`No source pages for ${slug}`);
  const inClause = pages.map((page, index) => cargoStringLiteral(page, `${slug}.overview_page[${index}]`)).join(", ");
  let all = [];
  let offset = 0;
  const limit = 200;
  const seenIds = new Set();

  if (dateFilter) {
    assertCargoDate(dateFilter.start, `${slug}.dateFilter.start`);
    assertCargoDate(dateFilter.end, `${slug}.dateFilter.end`);
  }

  while (true) {
    let whereClause = pages.length === 1
      ? `OverviewPage = ${cargoStringLiteral(pages[0], `${slug}.overview_page[0]`)}`
      : `OverviewPage IN (${inClause})`;

    if (dateFilter) {
      whereClause += ` AND DateTime_UTC >= ${cargoStringLiteral(`${dateFilter.start} 00:00:00`, `${slug}.dateFilter.startTime`)} AND DateTime_UTC <= ${cargoStringLiteral(`${dateFilter.end} 23:59:59`, `${slug}.dateFilter.endTime`)}`;
    }

    const cargoParams = new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "MatchSchedule",
      fields: "MatchId,Team1,Team2,Team1Score,Team2Score,DateTime_UTC=DateTimeUTC,OverviewPage,BestOf,Tab",
      where: whereClause,
      limit: limit.toString(),
      offset: offset.toString(),
      order_by: "DateTime_UTC ASC",
      maxlag: "1"
    });

    const batchRaw = await fandomClient.fetchWithRetry(`${FANDOM_API}?${cargoParams}`);
    const batch = batchRaw.map(record => record.title);

    if (!batch.length) break;

    const hasDuplicates = batch.some(record => {
      const matchId = record.MatchId;
      if (matchId != null && seenIds.has(String(matchId))) return true;
      if (matchId != null) seenIds.add(String(matchId));
      return false;
    });

    if (hasDuplicates) {
      throw new Error(`[FANDOM:MATCHES] ${slug} duplicate MatchId, aborting to prevent infinite loop`);
    }

    all = all.concat(batch);
    offset += batch.length;

    if (dateFilter) break;
    if (batch.length < limit) break;

    await new Promise(resolveDelay => setTimeout(resolveDelay, FETCH_DELAY_MS));
  }

  if (all.length === 0) {
    throw new Error(`[FANDOM:MATCHES] ${slug} returned 0 records`);
  }

  return all;
}
