import hashlib
import json
import re
import unicodedata
from datetime import datetime, timedelta


TOURNAMENT_FIELDS = (
    "name",
    "leagueShort",
    "overviewPages",
    "startDate",
    "endDate",
    "teamMap",
    "participantGroups",
)
CONFIG_DIGEST_PATTERN = re.compile(r"^[a-f0-9]{64}$")
TOURNAMENT_YEAR_PATTERN = re.compile(r"^(?:19|20)\d{2}$")
OVERVIEW_PAGE_FIELDS = ("overviewPage", "startDate", "endDate", "participantCount")


def parse_date(value: str):
    return datetime.strptime(value, "%Y-%m-%d").date()


def overview_page_names(tournament: dict) -> list:
    return [entry["overviewPage"] for entry in tournament["overviewPages"]]


def order_tournament_fields(tournament: dict) -> dict:
    if set(tournament) != set(TOURNAMENT_FIELDS):
        raise ValueError("Tournament fields must match the Config schema")
    ordered = {field: tournament[field] for field in TOURNAMENT_FIELDS}
    assert_tournament_name(ordered["name"])
    ordered["overviewPages"] = [
        {field: page[field] for field in OVERVIEW_PAGE_FIELDS}
        for page in ordered["overviewPages"]
    ]
    ordered["teamMap"] = dict(sorted(ordered["teamMap"].items()))
    return ordered


def assert_config_digest(value, label: str) -> str:
    if not isinstance(value, str) or not CONFIG_DIGEST_PATTERN.fullmatch(value):
        raise ValueError(f"{label} must be a SHA-256 digest")
    return value


def build_tournament_config(active: list, archive: list) -> dict:
    payload = {
        "active": [order_tournament_fields(tournament) for tournament in active],
        "archive": [order_tournament_fields(tournament) for tournament in archive],
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return {
        "configDigest": hashlib.sha256(serialized).hexdigest(),
        **payload,
    }


def normalize_tournament_name(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Tournament name must be a string")
    name = " ".join(unicodedata.normalize("NFC", value).split())
    year_indexes = [
        index
        for index, token in enumerate(name.split(" "))
        if TOURNAMENT_YEAR_PATTERN.fullmatch(token)
    ]
    if not year_indexes:
        return name
    if len(year_indexes) != 1:
        raise ValueError(f"Tournament name must contain exactly one year: {value}")
    tokens = name.split(" ")
    year = tokens.pop(year_indexes[0])
    if not tokens:
        raise ValueError(f"Tournament name missing text after year normalization: {value}")
    return " ".join([year, *tokens])


def assert_tournament_name(value: str) -> str:
    normalized = normalize_tournament_name(value)
    first_token = normalized.split(" ", 1)[0]
    if normalized != value or not TOURNAMENT_YEAR_PATTERN.fullmatch(first_token):
        raise ValueError("Tournament name must use the canonical year-first format")
    return value


def matches_tournament_filter(name: str, overview_page: str, values: list) -> bool:
    haystack = f"{name}\n{overview_page}".lower()
    return any(keyword.strip().lower() in haystack for keyword in values)


def assert_boolean_field(row: dict, field: str) -> None:
    value = row.get(field)
    if isinstance(value, str) and value and value not in {"0", "1"}:
        raise ValueError(f"Tournament {field} must be 0 or 1: {row['OverviewPage']}")


def classify_tournament_eligibility(row: dict, regions: list, whitelist: list, blacklist: list) -> str:
    name = row["Name"]
    overview_page = row["OverviewPage"]
    assert_boolean_field(row, "IsPlayoffs")
    whitelisted = matches_tournament_filter(name, overview_page, whitelist)
    blacklisted = matches_tournament_filter(name, overview_page, blacklist)
    if whitelisted:
        return "eligible"
    if blacklisted:
        return "ineligible"

    tournament_level = row.get("TournamentLevel")
    region = row.get("Region")
    if isinstance(tournament_level, str) and tournament_level and tournament_level != "Primary":
        return "ineligible"
    if isinstance(region, str) and region and region not in regions:
        return "ineligible"

    filter_values = (tournament_level, region)
    if any(
        not isinstance(value, str) or not value
        for value in filter_values
    ):
        return "undetermined"
    return "eligible"


def deduplicate_source_rows(rows: list) -> list:
    rows_by_page = {}
    for item in rows:
        row = item.get("title")
        if not isinstance(row, dict):
            raise ValueError("Cargo tournament row missing title")
        overview_page = row.get("OverviewPage")
        if not isinstance(overview_page, str) or not overview_page:
            raise ValueError("Cargo tournament row missing OverviewPage")
        existing = rows_by_page.get(overview_page)
        if existing is not None and existing != item:
            raise ValueError(f"Cargo tournament source conflict: {overview_page}")
        rows_by_page[overview_page] = item
    return list(rows_by_page.values())


def assert_active_source_complete(old_active: list, source_rows: list) -> None:
    source_pages = {
        item["title"].get("OverviewPage")
        for item in source_rows
        if isinstance(item.get("title"), dict)
    }
    missing = [
        f"{tournament['name']}:{page}"
        for tournament in old_active
        for page in overview_page_names(tournament)
        if page not in source_pages
    ]
    if missing:
        raise ValueError(f"Active Cargo source missing: {', '.join(missing)}")


def assert_configs_disjoint(active: list, archive: list) -> None:
    active_names = {tournament["name"] for tournament in active}
    overlap = sorted(
        tournament["name"]
        for tournament in archive
        if tournament["name"] in active_names
    )
    if overlap:
        raise ValueError(f"TournamentConfig active/archive overlap: {', '.join(overlap)}")

    page_owners = {}
    for label, tournaments in (("TournamentConfig.active", active), ("TournamentConfig.archive", archive)):
        for tournament in tournaments:
            for page in overview_page_names(tournament):
                owner = f"{label}:{tournament['name']}"
                existing = page_owners.get(page)
                if existing is not None and existing != owner:
                    raise ValueError(f"Tournament overviewPage identity conflict: {page}")
                page_owners[page] = owner


def assert_candidate_names(candidates: list, old_active: list, archive: list) -> None:
    archive_by_page = {}
    for tournament in archive:
        for page in overview_page_names(tournament):
            archive_by_page.setdefault(page, set()).add(tournament["name"])

    old_by_name = {
        tournament["name"]: set(overview_page_names(tournament))
        for tournament in old_active
    }
    archive_names = {tournament["name"] for tournament in archive}
    assigned_names = set()

    for candidate in candidates:
        pages = overview_page_names(candidate)
        archived_matches = {
            name
            for page in pages
            for name in archive_by_page.get(page, set())
        }
        if archived_matches:
            raise ValueError(
                f"Current tournament matches TournamentConfig.archive: {candidate['name']}:{','.join(sorted(archived_matches))}"
            )

        name = candidate["name"]
        try:
            assert_tournament_name(name)
        except ValueError as error:
            raise ValueError(f"Tournament candidate name is not canonical: {name}") from error
        old_pages = old_by_name.get(name)
        if old_pages is not None and old_pages.isdisjoint(pages):
            raise ValueError(f"Generated name collides with another Active tournament: {name}")
        if name in archive_names:
            raise ValueError(f"Generated name collides with TournamentConfig.archive: {name}")

        if name in assigned_names:
            raise ValueError(f"Duplicate current tournament name: {name}")
        assigned_names.add(name)


def classify_lifecycle(tournament: dict, current_date, preheat_days: int, expire_days: int) -> str:
    start_date = parse_date(tournament["startDate"])
    end_date = parse_date(tournament["endDate"])
    if start_date > current_date + timedelta(days=preheat_days):
        return "tooEarly"
    if current_date > end_date + timedelta(days=expire_days):
        return "expired"
    return "active"


def sort_tournaments(tournaments: list) -> list:
    return sorted(
        tournaments,
        key=lambda tournament: (
            tournament["startDate"],
            tournament["endDate"],
            tournament["name"],
        ),
        reverse=True,
    )


def build_membership_transition(
    old_active: list,
    old_archive: list,
    candidates: list,
    current_date,
    preheat_days: int,
    expire_days: int,
) -> dict:
    classified = {"active": [], "expired": [], "tooEarly": []}
    for candidate in candidates:
        lifecycle = classify_lifecycle(candidate, current_date, preheat_days, expire_days)
        classified[lifecycle].append(candidate)

    active = sort_tournaments(classified["active"])
    old_active_by_name = {tournament["name"]: tournament for tournament in old_active}
    active_names = {tournament["name"] for tournament in active}
    expired_by_name = {tournament["name"]: tournament for tournament in classified["expired"]}
    removed_names = set(old_active_by_name) - active_names
    archived_names = sorted(name for name in removed_names if name in expired_by_name)
    dropped_names = sorted(removed_names - set(archived_names))

    archive_by_name = {tournament["name"]: tournament for tournament in old_archive}
    for name in archived_names:
        if name in archive_by_name:
            raise ValueError(f"Archive transition name already exists: {name}")
        archive_by_name[name] = expired_by_name[name]

    return {
        "active": active,
        "archive": sort_tournaments(list(archive_by_name.values())),
        "archivedNames": archived_names,
        "droppedNames": dropped_names,
        "tooEarly": sort_tournaments(classified["tooEarly"]),
        "expired": sort_tournaments(classified["expired"]),
    }


def build_transition_manifest(
    old_active: list,
    new_active: list,
    archived_names: list,
    dropped_names: list,
) -> dict:
    old_active_by_name = {tournament["name"]: tournament for tournament in old_active}
    new_active_by_name = {tournament["name"]: tournament for tournament in new_active}

    active_added = sorted(set(new_active_by_name) - set(old_active_by_name))
    active_updated = sorted(
        name
        for name in set(new_active_by_name) & set(old_active_by_name)
        if new_active_by_name[name] != old_active_by_name[name]
    )
    expected_active_removed = set(old_active_by_name) - set(new_active_by_name)
    declared_active_removed = set(archived_names) | set(dropped_names)
    if set(archived_names) & set(dropped_names):
        raise ValueError("Active transition categories overlap")
    if expected_active_removed != declared_active_removed:
        raise ValueError("Active transition manifest is incomplete")

    return {
        "activeAddedNames": active_added,
        "activeUpdatedNames": active_updated,
        "activeArchivedNames": sorted(archived_names),
        "activeDroppedNames": sorted(dropped_names),
        "archiveAddedNames": sorted(archived_names),
    }
