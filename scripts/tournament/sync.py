import json
import os
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta

import requests

from model import (
    TOURNAMENT_FIELDS,
    assert_config_digest,
    assert_tournament_name,
    assert_active_source_complete,
    assert_configs_disjoint,
    assert_candidate_names,
    build_tournament_config,
    build_membership_transition,
    build_transition_manifest,
    classify_tournament_eligibility,
    deduplicate_source_rows,
    overview_page_names,
    normalize_tournament_name,
    parse_date,
)

now = datetime.now()
today_dt = now.date()
TOURNAMENT_CONFIG_FILE = "config/TournamentConfig.json"
SYNC_CONFIG_FILE = "config/TournamentSync.json"
MEDIAWIKI_TITLE_BATCH_SIZE = 50

# ==================== 工具函数 ====================

def validate_tournament_list(value, label: str) -> list:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a JSON array")
    schema_fields = set(TOURNAMENT_FIELDS)
    required = ("name", "startDate", "endDate")
    names = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"{label}[{index}] must be an object")
        if set(item) != schema_fields:
            raise ValueError(f"{label}[{index}] fields must match the tournament schema")
        if any(not isinstance(item.get(field), str) or not item[field].strip() for field in required):
            raise ValueError(f"{label}[{index}] fields missing")
        try:
            assert_tournament_name(item["name"])
        except ValueError as error:
            raise ValueError(f"{label}[{index}].name must use the canonical year-first format") from error
        if not isinstance(item.get("leagueShort"), str) or not item["leagueShort"].strip():
            raise ValueError(f"{label}[{index}].leagueShort must be a non-empty string")
        team_map = item.get("teamMap")
        if (
            not isinstance(team_map, dict)
            or any(
                not isinstance(source, str)
                or not source.strip()
                or not isinstance(target, str)
                or not target.strip()
                for source, target in team_map.items()
            )
        ):
            raise ValueError(f"{label}[{index}].teamMap must be a string map")
        overview_pages = item.get("overviewPages")
        if not isinstance(overview_pages, list) or not overview_pages:
            raise ValueError(f"{label}[{index}].overviewPages must be a non-empty array")
        overview_page_names = []
        for page_index, page in enumerate(overview_pages):
            page_label = f"{label}[{index}].overviewPages[{page_index}]"
            if not isinstance(page, dict) or set(page) != {"overviewPage", "startDate", "endDate", "participantCount"}:
                raise ValueError(f"{page_label} fields must match the overview page schema")
            overview_page = page.get("overviewPage")
            if (
                not isinstance(overview_page, str)
                or not overview_page.strip()
                or not isinstance(page.get("startDate"), str)
                or not isinstance(page.get("endDate"), str)
                or not isinstance(page.get("participantCount"), int)
                or isinstance(page.get("participantCount"), bool)
                or page["participantCount"] < 1
            ):
                raise ValueError(f"{page_label} is invalid")
            if parse_date(page["startDate"]) > parse_date(page["endDate"]):
                raise ValueError(f"{page_label} date range invalid")
            overview_page_names.append(overview_page)
        if len(set(overview_page_names)) != len(overview_page_names):
            raise ValueError(f"{label}[{index}].overviewPages contains duplicate overviewPage")
        participant_groups = item.get("participantGroups")
        if not isinstance(participant_groups, list):
            raise ValueError(f"{label}[{index}].participantGroups must be an array")
        group_keys = set()
        group_teams = set()
        for group_index, group in enumerate(participant_groups):
            group_label = f"{label}[{index}].participantGroups[{group_index}]"
            if not isinstance(group, dict) or set(group) != {"overviewPage", "groupDisplay", "teams"}:
                raise ValueError(f"{group_label} fields must match the team group schema")
            overview_page = group.get("overviewPage")
            group_display = group.get("groupDisplay")
            teams = group.get("teams")
            if (
                not isinstance(overview_page, str)
                or overview_page not in overview_page_names
                or not isinstance(group_display, str)
                or not group_display.strip()
                or not isinstance(teams, list)
                or not teams
                or any(not isinstance(team, str) or not team.strip() for team in teams)
            ):
                raise ValueError(f"{group_label} is invalid")
            group_key = (overview_page, group_display)
            if group_key in group_keys:
                raise ValueError(f"{group_label} duplicates a team group")
            group_keys.add(group_key)
            for team in teams:
                membership_key = (overview_page, team)
                if membership_key in group_teams:
                    raise ValueError(f"{group_label} duplicates a team membership")
                if team not in team_map:
                    raise ValueError(f"{group_label} team missing from teamMap: {team}")
                group_teams.add(membership_key)
        start_date = parse_date(item["startDate"])
        end_date = parse_date(item["endDate"])
        if start_date > end_date:
            raise ValueError(f"{label}[{index}] date range invalid")
        if start_date != min(parse_date(page["startDate"]) for page in overview_pages):
            raise ValueError(f"{label}[{index}].startDate must match the earliest overview page")
        if end_date != max(parse_date(page["endDate"]) for page in overview_pages):
            raise ValueError(f"{label}[{index}].endDate must match the latest overview page")
        if item["name"] in names:
            raise ValueError(f"Duplicate name in {label}: {item['name']}")
        names.add(item["name"])
    return value


def load_tournament_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as file:
        value = json.load(file)
    if not isinstance(value, dict) or set(value) != {"configDigest", "active", "archive"}:
        raise ValueError(f"{path} fields must be configDigest, active and archive")
    stored_digest = assert_config_digest(value["configDigest"], f"{path}.configDigest")
    active = validate_tournament_list(value["active"], f"{path}.active")
    archive = validate_tournament_list(value["archive"], f"{path}.archive")
    config = build_tournament_config(active, archive)
    if config["configDigest"] != stored_digest:
        raise ValueError(f"{path}.configDigest does not match config content")
    assert_configs_disjoint(config["active"], config["archive"])
    return config

def add_overview_page(event: dict, overview_page: str, start_date, end_date) -> None:
    dates = (start_date, end_date)
    existing = event["overviewPageDates"].get(overview_page)
    if existing is not None and existing != dates:
        raise ValueError(f"Tournament overviewPage dates conflict: {overview_page}")
    event["overviewPageDates"][overview_page] = dates


def project_overview_pages(event: dict) -> list:
    return [
        {
            "overviewPage": overview_page,
            "startDate": str(dates[0]),
            "endDate": str(dates[1]),
        }
        for overview_page, dates in sorted(
            event["overviewPageDates"].items(),
            key=lambda item: (*item[1], item[0]),
        )
    ]

def log(msg: str) -> None:
    print(msg, flush=True)

def log_tree(lines: list) -> None:
    for line in lines:
        print(line, flush=True)

def cargo_string_literal(value, label: str) -> str:
    text = str(value)
    if not text:
        raise ValueError(f"Empty Cargo value: {label}")
    if any(ch in text for ch in ("\0", "\r", "\n")):
        raise ValueError(f"Invalid Cargo value: {label}")
    return "'" + text.replace("'", "''") + "'"

def build_field_condition(field: str, value) -> str:
    if isinstance(value, list):
        if len(value) == 0:
            raise ValueError(f"Empty Cargo list: {field}")
        if len(value) == 1:
            return f"{field} = {cargo_string_literal(value[0], field)}"
        values = ", ".join(cargo_string_literal(item, field) for item in value)
        return f"{field} IN ({values})"
    return f"{field} = {cargo_string_literal(value, field)}"

def validate_filter_values(values: list, label: str, allow_empty: bool = False) -> None:
    if (
        not isinstance(values, list)
        or (not allow_empty and not values)
        or any(not isinstance(value, str) or not value.strip() for value in values)
    ):
        raise ValueError(f"{label} must contain non-empty strings")

def load_sync_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as file:
        value = json.load(file)

    fields = {
        "discoveryDays",
        "preheatDays",
        "expireDays",
        "regions",
        "whitelist",
        "blacklist",
        "cargoFields",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{path} fields must match the TournamentSync schema")

    for field in ("discoveryDays", "preheatDays", "expireDays"):
        field_value = value[field]
        if not isinstance(field_value, int) or isinstance(field_value, bool) or field_value < 0:
            raise ValueError(f"{path}.{field} must be a non-negative integer")

    validate_filter_values(value["regions"], f"{path}.regions")
    validate_filter_values(value["whitelist"], f"{path}.whitelist", allow_empty=True)
    validate_filter_values(value["blacklist"], f"{path}.blacklist", allow_empty=True)
    validate_filter_values(value["cargoFields"], f"{path}.cargoFields")
    return value


SYNC_CONFIG = load_sync_config(SYNC_CONFIG_FILE)

def make_session(url: str, bot_user: str, bot_pass: str) -> requests.Session:
    MAX_LOGIN_ATTEMPTS = 3
    session = requests.Session()
    session.headers.update({"User-Agent": "LoLStatsWorker/2026 (User:HsuX)"})

    if not (bot_user and bot_pass):
        log("🚀 未检测到凭证 (FANDOM_BOT_USERNAME/PASSWORD)")
        print("::error::Missing Fandom API credentials", flush=True)
        sys.exit(1)

    for attempt in range(1, MAX_LOGIN_ATTEMPTS + 1):
        try:
            token_res = session.get(url, params={
                "action": "query", "meta": "tokens", "type": "login", "format": "json"
            }, timeout=15).json()
            login_token = token_res.get("query", {}).get("tokens", {}).get("logintoken")

            if login_token:
                login_res = session.post(url, data={
                    "action": "login", "lgname": bot_user, "lgpassword": bot_pass,
                    "lgtoken": login_token, "format": "json"
                }, timeout=15).json()

                if login_res.get("login", {}).get("result") == "Success":
                    log(f"🚀 认证成功 | 用户: {bot_user}")
                    return session
                else:
                    log(f"⚠️ 认证失败 | 重试 {attempt}/{MAX_LOGIN_ATTEMPTS} | {json.dumps(login_res, ensure_ascii=False)}")
            else:
                log(f"⚠️ 获取 token 失败 | 重试 {attempt}/{MAX_LOGIN_ATTEMPTS}")
        except Exception as e:
            log(f"⚠️ 认证异常 | 重试 {attempt}/{MAX_LOGIN_ATTEMPTS} | {e}")

        if attempt < MAX_LOGIN_ATTEMPTS:
            time.sleep(5 * attempt + random.uniform(0, 3))

    log("🚀 认证失败，已达最大重试次数")
    print("::error::Fandom API login failed after max retries", flush=True)
    sys.exit(1)

def calculate_api_retry_delay(attempt: int, response=None) -> float:
    retry_after = 0
    if response is not None:
        value = response.headers.get("Retry-After")
        if isinstance(value, str) and value.isdigit():
            retry_after = int(value)
    return max(30 * (2 ** (attempt - 1)), retry_after) + random.uniform(0, 5)


def fetch_api_object(
    session: requests.Session,
    url: str,
    params: dict,
    label: str,
) -> dict:
    max_attempts = 4
    last_error = None

    for attempt in range(1, max_attempts + 1):
        time.sleep(1)
        try:
            response = session.get(url, params=params, timeout=30)
            response.raise_for_status()
            response_json = response.json()
        except requests.exceptions.RequestException as error:
            last_error = error
            if attempt == max_attempts:
                break
            delay = calculate_api_retry_delay(attempt, getattr(error, "response", None))
            print(
                f"⚠️ 网络异常 | {delay:.0f}s 后重试 {attempt}/{max_attempts} | {error}",
                flush=True,
            )
            time.sleep(delay)
            continue

        if not isinstance(response_json, dict):
            raise ValueError(f"{label} response must be an object")
        api_error = response_json.get("error")
        if api_error is None:
            return response_json
        code = api_error.get("code") if isinstance(api_error, dict) else None
        if code not in {"ratelimited", "maxlag"}:
            raise RuntimeError(f"{label} API error: {api_error}")
        last_error = api_error
        if attempt == max_attempts:
            break
        delay = calculate_api_retry_delay(attempt, response)
        print(
            f"⚠️ API受限 | {delay:.0f}s 后重试 {attempt}/{max_attempts} | {api_error}",
            flush=True,
        )
        time.sleep(delay)

    raise RuntimeError(f"{label} failed after retries: {last_error}")


def fetch_cargo(session: requests.Session, url: str, base_params: dict) -> list:
    all_data, offset, limit = [], 0, 100
    while True:
        params = {**base_params, "limit": str(limit), "offset": str(offset)}
        response_json = fetch_api_object(
            session,
            url,
            params,
            f"Cargo page offset={offset}",
        )
        page_data = response_json.get("cargoquery")
        if not isinstance(page_data, list):
            raise ValueError("Cargo response cargoquery must be an array")

        if not page_data:
            break

        all_data.extend(page_data)
        if len(page_data) < limit:
            break

        offset += limit

    return all_data


def fetch_page_sources(
    session: requests.Session,
    url: str,
    titles: list,
    optional_titles: set,
) -> dict:
    validate_filter_values(titles, "MediaWiki titles")
    if not isinstance(optional_titles, set) or not optional_titles.issubset(set(titles)):
        raise ValueError("Optional MediaWiki titles must be a subset of titles")

    sources = {}
    for offset in range(0, len(titles), MEDIAWIKI_TITLE_BATCH_SIZE):
        batch = titles[offset:offset + MEDIAWIKI_TITLE_BATCH_SIZE]
        response_json = fetch_api_object(
            session,
            url,
            {
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "redirects": "1",
                "titles": "|".join(batch),
            },
            f"MediaWiki source batch offset={offset}",
        )
        query = response_json.get("query")
        if not isinstance(query, dict) or not isinstance(query.get("pages"), list):
            raise ValueError("MediaWiki source response query.pages must be an array")

        resolved_titles = {title: title for title in batch}
        for mapping_name in ("normalized", "redirects"):
            mappings = query.get(mapping_name, [])
            if not isinstance(mappings, list):
                raise ValueError(f"MediaWiki source response query.{mapping_name} must be an array")
            for mapping in mappings:
                if (
                    not isinstance(mapping, dict)
                    or not isinstance(mapping.get("from"), str)
                    or not isinstance(mapping.get("to"), str)
                ):
                    raise ValueError(f"Invalid MediaWiki {mapping_name} mapping: {mapping}")
                for requested_title, resolved_title in resolved_titles.items():
                    if resolved_title == mapping["from"]:
                        resolved_titles[requested_title] = mapping["to"]

        pages_by_title = {}
        for page in query["pages"]:
            if not isinstance(page, dict) or not isinstance(page.get("title"), str):
                raise ValueError(f"Invalid MediaWiki source page: {page}")
            if page["title"] in pages_by_title:
                raise ValueError(f"Duplicate MediaWiki source page: {page['title']}")
            pages_by_title[page["title"]] = page

        for requested_title, resolved_title in resolved_titles.items():
            page = pages_by_title.get(resolved_title)
            if page is None:
                raise ValueError(f"MediaWiki source page missing from response: {requested_title}")
            if page.get("missing") is True:
                if requested_title not in optional_titles:
                    raise ValueError(f"MediaWiki source page does not exist: {requested_title}")
                sources[requested_title] = None
                continue
            revisions = page.get("revisions")
            if not isinstance(revisions, list) or len(revisions) != 1:
                raise ValueError(f"MediaWiki source page revisions invalid: {requested_title}")
            slots = revisions[0].get("slots")
            main = slots.get("main") if isinstance(slots, dict) else None
            content = main.get("content") if isinstance(main, dict) else None
            if not isinstance(content, str):
                raise ValueError(f"MediaWiki source page content invalid: {requested_title}")
            sources[requested_title] = content

    return sources

def tournament_query(where: str) -> dict:
    return {
        "action": "cargoquery",
        "format": "json",
        "tables": "Tournaments",
        "fields": ", ".join(SYNC_CONFIG["cargoFields"]),
        "where": where,
        "order_by": "DateStart ASC, OverviewPage ASC",
    }

def build_discovery_window_where() -> str:
    latest_start = today_dt + timedelta(days=SYNC_CONFIG["discoveryDays"])
    return " AND ".join([
        f"Date >= {cargo_string_literal(today_dt, 'Date')}",
        f"DateStart <= {cargo_string_literal(latest_start, 'DateStart')}",
    ])

def chunked(values: list, size: int):
    for index in range(0, len(values), size):
        yield values[index:index + size]

def fetch_tournament_source_rows(session, url: str, old_active: list) -> list:
    discovery_rows = deduplicate_source_rows(
        fetch_cargo(session, url, tournament_query(build_discovery_window_where()))
    )
    discovery_pages = {item["title"]["OverviewPage"] for item in discovery_rows}
    active_pages = {
        page
        for tournament in old_active
        for page in overview_page_names(tournament)
    }
    missing_active_pages = sorted(active_pages - discovery_pages)
    reconciliation_rows = []
    for pages in chunked(missing_active_pages, 40):
        where = build_field_condition("OverviewPage", pages)
        reconciliation_rows.extend(fetch_cargo(session, url, tournament_query(where)))

    source_rows = deduplicate_source_rows(discovery_rows + reconciliation_rows)
    assert_active_source_complete(old_active, source_rows)
    return source_rows

def attach_team_maps(
    session,
    url: str,
    tournaments: list,
) -> None:
    overview_pages = sorted({
        page
        for tournament in tournaments
        for page in overview_page_names(tournament)
    })
    if not overview_pages:
        return
    roster_rows = fetch_cargo(session, url, {
        "action": "cargoquery",
        "format": "json",
        "tables": "TournamentRosters=TR,Teamnames=TN",
        "fields": (
            "TR.OverviewPage=OverviewPage,TR.Team=Team,"
            "TN.Short=Short,TN.Exception=isException"
        ),
        "join_on": "TR.Team=TN.Link",
        "where": (
            "TR.OverviewPage IN "
            f"({', '.join(cargo_string_literal(page, 'OverviewPage') for page in overview_pages)})"
        ),
        "order_by": "TR.OverviewPage ASC,TR.Team ASC",
    })
    maps_by_page = {page: {} for page in overview_pages}
    for item in roster_rows:
        row = item.get("title", {})
        overview_page = row.get("OverviewPage", "")
        team = row.get("Team", "")
        short = row.get("Short", "")
        is_exception = row.get("isException")
        if overview_page not in maps_by_page or is_exception not in {"0", "1"}:
            raise ValueError(f"Invalid tournament team row: {row}")
        if is_exception == "1":
            continue
        if not team or not short:
            raise ValueError(f"Invalid tournament team row: {row}")
        existing = maps_by_page[overview_page].get(team)
        if existing is not None and existing != short:
            raise ValueError(f"Conflicting team short: {overview_page}:{team}")
        maps_by_page[overview_page][team] = short

    for tournament in tournaments:
        team_map = {}
        for source in tournament["overviewPages"]:
            overview_page = source["overviewPage"]
            page_map = maps_by_page[overview_page]
            for team, short in page_map.items():
                existing = team_map.get(team)
                if existing is not None and existing != short:
                    raise ValueError(f"Conflicting tournament team short: {tournament['name']}:{team}")
                team_map[team] = short
        tournament["teamMap"] = dict(sorted(team_map.items()))


def read_participant_slot_counts(
    session,
    url: str,
    overview_pages: list,
) -> dict:
    participant_rows = fetch_cargo(session, url, {
        "action": "cargoquery",
        "format": "json",
        "tables": "ParticipantsArgs=PA",
        "fields": "PA.OverviewPage=OverviewPage,PA.N_TeamInPage=TeamSlot",
        "where": (
            "PA.OverviewPage IN "
            f"({', '.join(cargo_string_literal(page, 'OverviewPage') for page in overview_pages)})"
        ),
        "order_by": "PA.OverviewPage ASC,PA.N_TeamInPage ASC",
    })
    slots_by_page = {page: set() for page in overview_pages}
    for item in participant_rows:
        row = item.get("title", {})
        overview_page = row.get("OverviewPage", "")
        if overview_page not in slots_by_page:
            raise ValueError(f"Invalid tournament participant row: {row}")
        team_slot = parse_positive_integer(
            row.get("TeamSlot"),
            f"ParticipantsArgs.{overview_page}.N_TeamInPage",
        )
        if team_slot in slots_by_page[overview_page]:
            raise ValueError(f"Duplicate tournament participant slot: {overview_page}:{team_slot}")
        slots_by_page[overview_page].add(team_slot)

    counts = {}
    for overview_page, slots in slots_by_page.items():
        if not slots:
            continue
        expected_slots = set(range(1, len(slots) + 1))
        if slots != expected_slots:
            raise ValueError(f"Tournament participant slots invalid: {overview_page}")
        counts[overview_page] = len(slots)
    return counts


def read_roster_participant_counts(
    session,
    url: str,
    overview_pages: list,
) -> dict:
    if not overview_pages:
        return {}
    roster_rows = fetch_cargo(session, url, {
        "action": "cargoquery",
        "format": "json",
        "tables": "TournamentRosters=TR",
        "fields": "TR.OverviewPage=OverviewPage,TR.Team=Team",
        "where": (
            "TR.OverviewPage IN "
            f"({', '.join(cargo_string_literal(page, 'OverviewPage') for page in overview_pages)})"
        ),
        "order_by": "TR.OverviewPage ASC,TR.Team ASC",
    })
    counts = {page: 0 for page in overview_pages}
    for item in roster_rows:
        row = item.get("title", {})
        overview_page = row.get("OverviewPage", "")
        team = row.get("Team", "")
        if overview_page not in counts or not isinstance(team, str) or not team.strip():
            raise ValueError(f"Invalid tournament roster participant row: {row}")
        counts[overview_page] += 1
    for overview_page, count in counts.items():
        if count < 1:
            raise ValueError(f"Tournament participants missing: {overview_page}")
    return counts


def attach_participant_counts(
    session,
    url: str,
    tournaments: list,
) -> None:
    overview_pages = sorted({
        page
        for tournament in tournaments
        for page in overview_page_names(tournament)
    })
    if not overview_pages:
        return

    participant_counts = read_participant_slot_counts(session, url, overview_pages)
    roster_pages = [page for page in overview_pages if page not in participant_counts]
    participant_counts.update(read_roster_participant_counts(session, url, roster_pages))

    for tournament in tournaments:
        for source in tournament["overviewPages"]:
            overview_page = source["overviewPage"]
            source["participantCount"] = participant_counts[overview_page]


def parse_positive_integer(value, label: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} must be a positive integer") from error
    if parsed < 1 or str(parsed) != str(value):
        raise ValueError(f"{label} must be a positive integer")
    return parsed


WIKI_HEADING_PATTERN = re.compile(
    r"^(?P<marks>={2,6})[ \t]*(?P<title>.*?)[ \t]*(?P=marks)[ \t]*$",
    re.MULTILINE,
)
PARTICIPANT_SECTION_KEYS = {"participants", "notable participants"}


def normalize_wiki_heading(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Wiki heading must be a string")
    text = re.sub(r"<!--.*?-->", "", value, flags=re.DOTALL)
    text = re.sub(
        r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]",
        lambda match: match.group(1),
        text,
    )
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("'''", "").replace("''", "")
    text = "".join(
        character
        for character in text
        if unicodedata.category(character) != "Cf"
    )
    return " ".join(text.split()).casefold()


def read_wiki_headings(source: str) -> list:
    if not isinstance(source, str):
        raise ValueError("Wiki source must be a string")
    uncommented_source = re.sub(r"<!--.*?-->", "", source, flags=re.DOTALL)
    headings = []
    for match in WIKI_HEADING_PATTERN.finditer(uncommented_source):
        key = normalize_wiki_heading(match.group("title"))
        if key:
            headings.append({
                "level": len(match.group("marks")),
                "key": key,
                "offset": match.start(),
            })
    return headings


def read_participant_group_heading_keys(source: str, body_only: bool = False) -> set:
    headings = read_wiki_headings(source)
    if body_only:
        group_keys = [
            heading["key"]
            for heading in headings
            if heading["level"] == 3
        ]
    else:
        participant_headings = [
            heading
            for heading in headings
            if (
                heading["level"] == 2
                and heading["key"] in PARTICIPANT_SECTION_KEYS
            )
        ]
        if len(participant_headings) > 1:
            raise ValueError("Wiki source contains duplicate Participants sections")
        if not participant_headings:
            return set()
        participant_heading = participant_headings[0]
        section_end = next(
            (
                heading["offset"]
                for heading in headings
                if (
                    heading["offset"] > participant_heading["offset"]
                    and heading["level"] <= participant_heading["level"]
                )
            ),
            len(source),
        )
        group_keys = [
            heading["key"]
            for heading in headings
            if (
                heading["level"] == 3
                and participant_heading["offset"] < heading["offset"] < section_end
            )
        ]

    if len(group_keys) != len(set(group_keys)):
        raise ValueError("Wiki Participants section contains duplicate group headings")
    return set(group_keys)


def read_participant_group_headings(
    session,
    url: str,
    overview_pages: list,
) -> dict:
    data_titles = {
        overview_page: f"Data:{overview_page}/Participants"
        for overview_page in overview_pages
    }
    optional_titles = set(data_titles.values())
    sources = fetch_page_sources(
        session,
        url,
        overview_pages + sorted(optional_titles),
        optional_titles,
    )
    headings_by_page = {}
    for overview_page in overview_pages:
        data_source = sources[data_titles[overview_page]]
        if data_source is not None:
            headings_by_page[overview_page] = read_participant_group_heading_keys(
                data_source,
                body_only=True,
            )
            continue
        headings_by_page[overview_page] = read_participant_group_heading_keys(
            sources[overview_page],
        )
    return headings_by_page


def attach_participant_groups(
    session,
    url: str,
    tournaments: list,
) -> None:
    overview_pages = sorted({
        page
        for tournament in tournaments
        for page in overview_page_names(tournament)
    })
    if not overview_pages:
        return
    participant_headings = read_participant_group_headings(
        session,
        url,
        overview_pages,
    )
    group_rows = fetch_cargo(session, url, {
        "action": "cargoquery",
        "format": "json",
        "tables": "TournamentGroups=TG,Teamnames=TN",
        "fields": (
            "TG.OverviewPage=OverviewPage,TG.Team=Team,"
            "TG.GroupName=GroupName,TG.GroupDisplay=GroupDisplay,"
            "TG.GroupN=GroupN,TN.Exception=isException"
        ),
        "join_on": "TG.Team=TN.Link",
        "where": (
            "TG.OverviewPage IN "
            f"({', '.join(cargo_string_literal(page, 'OverviewPage') for page in overview_pages)})"
        ),
        "order_by": "TG.OverviewPage ASC,TG.GroupN ASC,TG.Team ASC",
    })
    groups_by_page = {page: {} for page in overview_pages}
    memberships_by_page = {page: {} for page in overview_pages}
    for item in group_rows:
        row = item.get("title", {})
        overview_page = row.get("OverviewPage", "")
        team = row.get("Team", "")
        group_name = row.get("GroupName", "")
        group_display = row.get("GroupDisplay", "")
        is_exception = row.get("isException")
        if overview_page not in groups_by_page or is_exception not in {"0", "1"}:
            raise ValueError(f"Invalid tournament group row: {row}")
        if is_exception == "1":
            continue
        if not isinstance(group_name, str) or not group_name.strip():
            continue
        if normalize_wiki_heading(group_name) not in participant_headings[overview_page]:
            continue
        if (
            not isinstance(team, str)
            or not team.strip()
            or not isinstance(group_display, str)
            or not group_display.strip()
        ):
            raise ValueError(f"Invalid tournament group row: {row}")
        order = parse_positive_integer(
            row.get("GroupN"),
            f"TournamentGroups.{overview_page}.{group_name}.GroupN",
        )
        normalized_group_display = group_display.strip()
        group = groups_by_page[overview_page].get(group_name)
        if group is None:
            group = {
                "overviewPage": overview_page,
                "groupName": group_name,
                "groupDisplay": normalized_group_display,
                "order": order,
                "teams": [],
            }
            groups_by_page[overview_page][group_name] = group
        elif group["groupDisplay"] != normalized_group_display or group["order"] != order:
            raise ValueError(f"Conflicting tournament group: {overview_page}:{group_name}")
        membership = (group_name, normalized_group_display, order)
        existing_membership = memberships_by_page[overview_page].get(team)
        if existing_membership is not None:
            if existing_membership != membership:
                raise ValueError(f"Conflicting tournament group membership: {overview_page}:{team}")
            continue
        memberships_by_page[overview_page][team] = membership
        group["teams"].append(team)

    for tournament in tournaments:
        participant_groups = []
        for overview_page in overview_page_names(tournament):
            page_groups = sorted(
                groups_by_page[overview_page].values(),
                key=lambda group: (group["order"], group["groupName"]),
            )
            seen_orders = set()
            seen_group_displays = set()
            for group in page_groups:
                if group["order"] in seen_orders:
                    raise ValueError(
                        f"Duplicate tournament group order: {overview_page}:{group['order']}"
                    )
                seen_orders.add(group["order"])
                if group["groupDisplay"] in seen_group_displays:
                    raise ValueError(
                        f"Duplicate tournament group display: "
                        f"{overview_page}:{group['groupDisplay']}"
                    )
                seen_group_displays.add(group["groupDisplay"])
                missing_teams = sorted(set(group["teams"]) - set(tournament["teamMap"]))
                if missing_teams:
                    raise ValueError(
                        f"Tournament group teams missing from teamMap: "
                        f"{overview_page}:{','.join(missing_teams)}"
                    )
                participant_groups.append({
                    "overviewPage": overview_page,
                    "groupDisplay": group["groupDisplay"],
                    "teams": sorted(group["teams"]),
                })
            if len(page_groups) == 1:
                raise ValueError(
                    f"Participant group partition incomplete: {overview_page}"
                )
        tournament["participantGroups"] = participant_groups


def collect_fandom_leagues(source_rows: list) -> list:
    leagues = set()
    for item in source_rows:
        row = item.get("title")
        if not isinstance(row, dict):
            raise ValueError("Cargo tournament row missing title")
        league = row.get("League")
        if isinstance(league, str) and league:
            leagues.add(league)
    return sorted(leagues)


def read_league_group_short_map(session, url: str, fandom_leagues: list) -> dict:
    validate_filter_values(fandom_leagues, "Fandom leagues")
    league_condition = build_field_condition("LeagueGroups__Leagues._value", fandom_leagues)
    league_short_rows = fetch_cargo(session, url, {
        "action": "cargoquery",
        "format": "json",
        "tables": "LeagueGroups,LeagueGroups__Leagues",
        "fields": "LeagueGroups__Leagues._value=League,LeagueGroups.ShortName=leagueShort",
        "join_on": "LeagueGroups._ID=LeagueGroups__Leagues._rowID",
        "where": f"({league_condition}) AND LeagueGroups.ShortName IS NOT NULL AND LeagueGroups.ShortName != ''",
        "order_by": "LeagueGroups__Leagues._value ASC",
    })
    league_short_by_fandom_league = {}
    for item in league_short_rows:
        row = item.get("title", {})
        fandom_league = row.get("League", "")
        league_short = row.get("leagueShort", "")
        if not fandom_league or not league_short:
            raise ValueError(f"Invalid League Group row: {row}")
        existing = league_short_by_fandom_league.get(fandom_league)
        if existing is not None and existing != league_short:
            raise ValueError(f"Conflicting League Group Short: {fandom_league}")
        league_short_by_fandom_league[fandom_league] = league_short
    return league_short_by_fandom_league


def resolve_tab_event_page(tab_scope: str, event: str) -> str:
    normalized_scope = normalize_wiki_page(tab_scope)
    normalized_event = normalize_wiki_page(event)
    if not normalized_scope or not normalized_event:
        raise ValueError("TournamentTabs scope and event must be non-empty")
    if normalized_event == "Overview":
        return normalized_scope
    return normalize_wiki_page(f"{normalized_scope}/{normalized_event}")


def collect_tab_scope_candidates(overview_pages: list) -> list:
    candidates = set()
    for overview_page in overview_pages:
        normalized_page = normalize_wiki_page(overview_page)
        parts = normalized_page.split("/")
        candidates.update(
            "/".join(parts[:length])
            for length in range(1, len(parts) + 1)
        )
    return sorted(candidates)


def read_tournament_tab_memberships(session, url: str, overview_pages: list) -> dict:
    validate_filter_values(overview_pages, "Tournament tab pages", allow_empty=True)
    target_pages = {normalize_wiki_page(page) for page in overview_pages}
    scope_by_page = {}
    for scopes in chunked(collect_tab_scope_candidates(overview_pages), 40):
        scope_condition = build_field_condition("TournamentTabs.BasePage", scopes)
        rows = fetch_cargo(session, url, {
            "action": "cargoquery",
            "format": "json",
            "tables": "TournamentTabs,TournamentTabs__Events",
            "fields": (
                "TournamentTabs__Events._value=event,"
                "TournamentTabs.BasePage=tabScope"
            ),
            "join_on": "TournamentTabs._ID=TournamentTabs__Events._rowID",
            "where": scope_condition,
            "order_by": "TournamentTabs.BasePage ASC,TournamentTabs__Events._value ASC",
        })
        for item in rows:
            row = item.get("title")
            if not isinstance(row, dict):
                raise ValueError("Cargo TournamentTabs row missing title")
            event = row.get("event")
            tab_scope = row.get("tabScope")
            if (
                not isinstance(event, str)
                or not event
                or not isinstance(tab_scope, str)
                or not tab_scope
            ):
                raise ValueError(f"Invalid TournamentTabs row: {row}")
            normalized_scope = normalize_wiki_page(tab_scope)
            event_page = resolve_tab_event_page(normalized_scope, event)
            existing = scope_by_page.get(event_page)
            if existing is not None and existing != normalized_scope:
                raise ValueError(f"Conflicting TournamentTabs scope: {event_page}")
            scope_by_page[event_page] = normalized_scope

    relevant_scopes = {
        scope_by_page[page]
        for page in target_pages
        if page in scope_by_page
    }
    relevant_scope_by_page = {
        page: scope
        for page, scope in scope_by_page.items()
        if scope in relevant_scopes
    }
    return {
        "scopeByPage": relevant_scope_by_page,
        "memberPages": sorted(relevant_scope_by_page),
    }


def read_tournament_rows(session, url: str, overview_pages: list) -> list:
    validate_filter_values(overview_pages, "Tournament pages", allow_empty=True)
    rows = []
    for pages in chunked(overview_pages, 40):
        rows.extend(fetch_cargo(
            session,
            url,
            tournament_query(build_field_condition("OverviewPage", pages)),
        ))
    return deduplicate_source_rows(rows)


def parse_cargo_args(value: str, label: str) -> dict:
    if not isinstance(value, str):
        raise ValueError(f"{label} Args must be a string")
    if not value:
        return {}

    args = {}
    for entry in value.split(";@;"):
        parts = entry.split(":@:", 1)
        if len(parts) != 2 or not parts[0]:
            raise ValueError(f"Invalid {label} Args: {value}")
        key, argument = parts
        existing = args.get(key)
        if existing is not None and existing != argument:
            raise ValueError(f"Conflicting {label} Args key: {key}")
        args[key] = argument
    return args


def normalize_wiki_page(value: str) -> str:
    page = value.strip().lstrip(":").replace("_", " ")
    return page.split("#", 1)[0].strip()


def read_carried_over_from(session, url: str, overview_pages: list) -> dict:
    validate_filter_values(overview_pages, "Tournament record pages", allow_empty=True)
    carried_over_from = {}
    page_set = set(overview_pages)

    for pages in chunked(overview_pages, 40):
        page_condition = build_field_condition("OverviewPage", pages)
        standings_rows = fetch_cargo(session, url, {
            "action": "cargoquery",
            "format": "json",
            "tables": "StandingsArgs",
            "fields": "OverviewPage, TournamentGroup, Args",
            "where": page_condition,
            "order_by": "OverviewPage ASC, TournamentGroup ASC",
        })
        for item in standings_rows:
            row = item.get("title")
            if not isinstance(row, dict):
                raise ValueError("Cargo StandingsArgs row missing title")
            overview_page = row.get("OverviewPage")
            if overview_page not in page_set:
                raise ValueError(f"Unexpected StandingsArgs OverviewPage: {overview_page}")
            args = parse_cargo_args(row.get("Args"), f"StandingsArgs:{overview_page}")
            source_value = args.get("carried_over_from")
            if not source_value:
                continue
            source = normalize_wiki_page(source_value)
            if not source:
                raise ValueError(f"Empty carried_over_from: {overview_page}")
            existing = carried_over_from.get(overview_page)
            if existing is not None and existing != source:
                raise ValueError(f"Conflicting carried_over_from: {overview_page}")
            carried_over_from[overview_page] = source

    return carried_over_from


def missing_string_fields(row: dict, fields: tuple) -> list:
    return [
        field
        for field in fields
        if not isinstance(row.get(field), str) or not row[field]
    ]


def read_optional_string(row: dict, field: str):
    value = row.get(field)
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"Tournament {field} must be a string: {row['OverviewPage']}")
    normalized = value.strip()
    return normalized or None


def classify_tournament_rows(source_rows: list, active_overview_pages: set) -> dict:
    eligible_rows = []
    blocked_count = 0
    deferred_rows = []

    for item in source_rows:
        row = item.get("title")
        if not isinstance(row, dict):
            raise ValueError("Cargo tournament row missing title")
        overview_page = row.get("OverviewPage")
        if not isinstance(overview_page, str) or not overview_page:
            raise ValueError(f"Tournament row identity missing: {row}")

        missing_identity_fields = missing_string_fields(row, ("Name",))
        if missing_identity_fields:
            if overview_page in active_overview_pages:
                raise ValueError(
                    f"Active tournament row incomplete: {overview_page} | "
                    f"missing: {', '.join(missing_identity_fields)}"
                )
            deferred_rows.append({"overviewPage": overview_page, "missingFields": missing_identity_fields})
            continue

        eligibility = classify_tournament_eligibility(
            row,
            SYNC_CONFIG["regions"],
            SYNC_CONFIG["whitelist"],
            SYNC_CONFIG["blacklist"],
        )
        if eligibility == "undetermined":
            missing_fields = missing_string_fields(
                row,
                (
                    "TournamentLevel",
                    "Region",
                    "League",
                    "IsPlayoffs",
                    "startDate",
                    "endDate",
                ),
            )
            if overview_page in active_overview_pages:
                raise ValueError(
                    f"Active tournament row incomplete: {overview_page} | "
                    f"missing: {', '.join(missing_fields)}"
                )
            deferred_rows.append({"overviewPage": overview_page, "missingFields": missing_fields})
            continue
        if eligibility == "ineligible":
            blocked_count += 1
            continue
        eligible_rows.append(item)

    return {
        "eligibleRows": eligible_rows,
        "blockedCount": blocked_count,
        "deferredRows": deferred_rows,
    }


def build_tournament_nodes(
    eligible_rows: list,
    league_short_map: dict,
    tab_scope_by_page: dict,
    active_overview_pages: set,
) -> dict:
    nodes = {}
    deferred_rows = []

    for item in eligible_rows:
        row = item["title"]
        overview_page = row["OverviewPage"]
        missing_projection_fields = missing_string_fields(
            row,
            ("League", "IsPlayoffs", "startDate", "endDate"),
        )
        if missing_projection_fields:
            if overview_page in active_overview_pages:
                raise ValueError(
                    f"Active tournament projection incomplete: {overview_page} | "
                    f"missing: {', '.join(missing_projection_fields)}"
                )
            deferred_rows.append({
                "overviewPage": overview_page,
                "missingFields": missing_projection_fields,
            })
            continue

        fandom_league = row["League"]
        league_short = league_short_map.get(fandom_league)
        if not league_short:
            if overview_page in active_overview_pages:
                raise ValueError(
                    f"Active tournament League Short missing: {overview_page} | "
                    f"league: {fandom_league}"
                )
            deferred_rows.append({
                "overviewPage": overview_page,
                "missingFields": [f"LeagueShort:{fandom_league}"],
            })
            continue

        start_date = parse_date(row["startDate"])
        end_date = parse_date(row["endDate"])
        if start_date > end_date:
            raise ValueError(f"Tournament date range invalid: {overview_page}")
        nodes[overview_page] = {
            "overviewPage": overview_page,
            "name": normalize_tournament_name(row["Name"]),
            "isPlayoffs": row["IsPlayoffs"] == "1",
            "split": read_optional_string(row, "Split"),
            "tabScope": tab_scope_by_page.get(overview_page),
            "leagueShort": league_short,
            "startDate": start_date,
            "endDate": end_date,
        }

    return {"nodes": nodes, "deferredRows": deferred_rows}


def node_sort_key(node: dict) -> tuple:
    return (node["startDate"], node["endDate"], node["overviewPage"])


def build_chain_name(ordered_pages: list, nodes: dict) -> str:
    names = [nodes[page]["name"] for page in ordered_pages]
    if len(names) == 1:
        return names[0]

    token_lists = [name.split() for name in names]
    prefix_length = 0
    for tokens in zip(*token_lists):
        if len(set(tokens)) != 1:
            break
        prefix_length += 1

    if prefix_length == 0:
        return " + ".join(names)
    prefix = " ".join(token_lists[0][:prefix_length])
    suffixes = [
        " ".join(tokens[prefix_length:])
        for tokens in token_lists
        if tokens[prefix_length:]
    ]
    return prefix if not suffixes else f"{prefix} {' + '.join(suffixes)}"


def build_record_chains(nodes: dict, carried_over_from: dict) -> dict:
    record_pages = {page for page, node in nodes.items() if not node["isPlayoffs"]}
    predecessor_by_target = {}
    successor_by_source = {}

    for target, source in sorted(carried_over_from.items()):
        if target not in nodes:
            raise ValueError(f"Tournament carried_over_from target missing: {target}")
        if source not in nodes:
            raise ValueError(f"Tournament carried_over_from source missing: {target} -> {source}")
        if target == source:
            raise ValueError(f"Tournament carried_over_from self-reference: {target}")
        if target not in record_pages or source not in record_pages:
            raise ValueError(
                f"carried_over_from must connect record tournaments: {target} -> {source}"
            )
        existing_source = predecessor_by_target.get(target)
        if existing_source is not None and existing_source != source:
            raise ValueError(f"Conflicting carried_over_from source: {target}")
        existing_target = successor_by_source.get(source)
        if existing_target is not None and existing_target != target:
            raise ValueError(
                f"Tournament carried_over_from branch: {source} -> "
                f"{existing_target}, {target}"
            )
        predecessor_by_target[target] = source
        successor_by_source[source] = target

    chains = {}
    visited = set()
    roots = sorted(record_pages - set(predecessor_by_target))
    for root in roots:
        ordered_pages = []
        page = root
        while True:
            if page in visited:
                raise ValueError(f"Tournament carried_over_from cycle: {page}")
            visited.add(page)
            ordered_pages.append(page)
            successor = successor_by_source.get(page)
            if successor is None:
                break
            page = successor
        chains[root] = {
            "pages": ordered_pages,
            "terminalPage": ordered_pages[-1],
        }

    cycle_pages = sorted(record_pages - visited)
    if cycle_pages:
        raise ValueError(f"Tournament carried_over_from cycle: {', '.join(cycle_pages)}")
    return chains


def create_single_node_event(node: dict) -> dict:
    return {
        "overviewPageDates": {
            node["overviewPage"]: (node["startDate"], node["endDate"]),
        },
        "name": node["name"],
        "leagueShort": node["leagueShort"],
        "startDate": node["startDate"],
        "endDate": node["endDate"],
    }


def append_node_to_event(event: dict, node: dict) -> None:
    add_overview_page(
        event,
        node["overviewPage"],
        node["startDate"],
        node["endDate"],
    )
    event["startDate"] = min(event["startDate"], node["startDate"])
    event["endDate"] = max(event["endDate"], node["endDate"])


def index_terminal_record_owners(nodes: dict, record_chains: dict) -> dict:
    owners_by_key = {}
    for owner, chain in record_chains.items():
        terminal = nodes[chain["terminalPage"]]
        if terminal["tabScope"] is None or terminal["split"] is None:
            continue
        key = (terminal["tabScope"], terminal["split"])
        owners_by_key.setdefault(key, set()).add(owner)
    return owners_by_key


def match_postseason_owners(
    nodes: dict,
    record_chains: dict,
    selected_overview_pages: set,
) -> dict:
    owners_by_key = index_terminal_record_owners(nodes, record_chains)
    owner_by_postseason = {}
    standalone = []
    playoff_pages = sorted(
        (page for page, node in nodes.items() if node["isPlayoffs"]),
        key=lambda page: node_sort_key(nodes[page]),
    )

    for page in playoff_pages:
        node = nodes[page]
        if node["tabScope"] is None:
            if page in selected_overview_pages:
                standalone.append((node["name"], "TournamentTabs scope missing"))
            continue
        if node["split"] is None:
            if page in selected_overview_pages:
                standalone.append((node["name"], "Split missing"))
            continue

        key = (node["tabScope"], node["split"])
        owners = owners_by_key.get(key, set())
        if len(owners) > 1:
            if page in selected_overview_pages:
                raise ValueError(
                    f"Ambiguous postseason owner: {page} | "
                    f"scope: {node['tabScope']} | split: {node['split']} | "
                    f"owners: {', '.join(sorted(owners))}"
                )
            continue
        if not owners:
            if page in selected_overview_pages:
                standalone.append((
                    node["name"],
                    f"terminal record chain missing ({node['tabScope']} | {node['split']})",
                ))
            continue
        owner_by_postseason[page] = next(iter(owners))

    return {
        "ownerByPostseason": owner_by_postseason,
        "standalone": standalone,
    }


def build_record_event(ordered_pages: list, nodes: dict) -> dict:
    owner = ordered_pages[0]
    event = {
        "overviewPageDates": {},
        "name": build_chain_name(ordered_pages, nodes),
        "leagueShort": nodes[owner]["leagueShort"],
        "startDate": min(nodes[page]["startDate"] for page in ordered_pages),
        "endDate": max(nodes[page]["endDate"] for page in ordered_pages),
    }
    for page in ordered_pages:
        node = nodes[page]
        add_overview_page(event, page, node["startDate"], node["endDate"])
    return event


def build_grouped_events(
    nodes: dict,
    record_chains: dict,
    postseason_matches: dict,
    selected_overview_pages: set,
) -> dict:
    owner_by_postseason = postseason_matches["ownerByPostseason"]
    selected_record_owners = {
        owner
        for owner, chain in record_chains.items()
        if selected_overview_pages.intersection(chain["pages"])
    }
    selected_record_owners.update(
        owner
        for page, owner in owner_by_postseason.items()
        if page in selected_overview_pages
    )

    events = {
        owner: build_record_event(record_chains[owner]["pages"], nodes)
        for owner in sorted(selected_record_owners)
    }
    attached = []
    for page, owner in sorted(
        (
            (page, owner)
            for page, owner in owner_by_postseason.items()
            if owner in selected_record_owners
        ),
        key=lambda item: node_sort_key(nodes[item[0]]),
    ):
        node = nodes[page]
        append_node_to_event(events[owner], node)
        attached.append((events[owner]["name"], node["name"]))

    for page in sorted(
        (
            page
            for page, node in nodes.items()
            if (
                node["isPlayoffs"]
                and page in selected_overview_pages
                and page not in owner_by_postseason
            )
        ),
        key=lambda page: node_sort_key(nodes[page]),
    ):
        events[page] = create_single_node_event(nodes[page])

    assigned_pages = {
        page
        for event in events.values()
        for page in event["overviewPageDates"]
    }
    expected_pages = selected_overview_pages.intersection(nodes)
    missing_pages = sorted(expected_pages - assigned_pages)
    if missing_pages:
        raise ValueError(f"Tournament pages not grouped: {', '.join(missing_pages)}")

    return {
        "events": events,
        "attached": attached,
        "standalone": postseason_matches["standalone"],
        "assignedPages": assigned_pages,
    }


def group_tournament_nodes(
    nodes: dict,
    selected_overview_pages: set,
    carried_over_from: dict,
) -> dict:
    record_chains = build_record_chains(nodes, carried_over_from)
    postseason_matches = match_postseason_owners(
        nodes,
        record_chains,
        selected_overview_pages,
    )
    grouped_events = build_grouped_events(
        nodes,
        record_chains,
        postseason_matches,
        selected_overview_pages,
    )
    assigned_pages = grouped_events["assignedPages"]
    relevant_carried_over_from = {
        target: source
        for target, source in carried_over_from.items()
        if target in assigned_pages or source in assigned_pages
    }
    return {
        "mainEvents": grouped_events["events"],
        "carriedOverFrom": relevant_carried_over_from,
        "attachedPostseason": grouped_events["attached"],
        "independentPostseason": grouped_events["standalone"],
    }


def log_group_summary(
    source_count: int,
    classification: dict,
    groups: dict,
    projection_deferred_rows: list,
) -> None:
    deferred_rows = classification["deferredRows"] + projection_deferred_rows
    log("")
    log(f"⚙️ 处理阶段 ({source_count} 条 → {len(groups['mainEvents'])} 条)")
    lines = [f"├─ 🚫 拦截: {classification['blockedCount']} 条"]
    if deferred_rows:
        lines.append(f"├─ ⏳ 待完善: {len(deferred_rows)} 条")
        for row in deferred_rows:
            lines.append(
                f"│  └─ {row['overviewPage']} | "
                f"missing: {', '.join(row['missingFields'])}"
            )
    else:
        lines.append("├─ ⏳ 待完善: 无")

    if groups["carriedOverFrom"]:
        for target, source in sorted(groups["carriedOverFrom"].items()):
            lines.append(f"├─ 🔗 战绩继承: {source} → {target}")
    else:
        lines.append("├─ 🔗 战绩继承: 无")
    for event_name, postseason_name in groups["attachedPostseason"]:
        lines.append(
            f"├─ ✅ 附加季后赛: {event_name} ← {postseason_name} "
            "(TournamentTabs + Split)"
        )
    for postseason_name, reason in groups["independentPostseason"]:
        lines.append(f"├─ 📌 独立季后赛: {postseason_name} | {reason}")
    lines.append(f"└─ 🏟️ 最终赛事: {len(groups['mainEvents'])} 条")
    log_tree(lines)


def project_tournament_candidates(main_events: dict) -> list:
    return [
        {
            "name": event["name"],
            "leagueShort": event["leagueShort"],
            "overviewPages": project_overview_pages(event),
            "startDate": str(event["startDate"]),
            "endDate": str(event["endDate"]),
        }
        for event in main_events.values()
    ]


def resolve_config_transition(old_active: list, old_archive: list, candidates: list) -> dict:
    assert_candidate_names(candidates, old_active, old_archive)
    return build_membership_transition(
        old_active,
        old_archive,
        candidates,
        today_dt,
        SYNC_CONFIG["preheatDays"],
        SYNC_CONFIG["expireDays"],
    )


def log_lifecycle_summary(transition: dict) -> None:
    expired_events = [
        (tournament["name"], (today_dt - parse_date(tournament["endDate"])).days)
        for tournament in transition["expired"]
    ]
    upcoming_events = [
        (tournament["name"], (parse_date(tournament["startDate"]) - today_dt).days)
        for tournament in transition["tooEarly"]
    ]
    active = transition["active"]

    log("")
    log("📊 周期终审")

    lines = []
    if expired_events:
        lines.append(f"├─ ⏰ 已过期 ({len(expired_events)} 条):")
        for i, (name, days) in enumerate(expired_events):
            prefix = "│  ├─" if i < len(expired_events) - 1 else "│  └─"
            lines.append(f"{prefix} {name:<26} │ 已结束 {days:>3} 天")

    if upcoming_events:
        prefix = "├─" if active else "└─"
        lines.append(f"{prefix} 📅 未开赛 ({len(upcoming_events)} 条):")
        for i, (name, days) in enumerate(upcoming_events):
            sub_prefix = "│  ├─" if i < len(upcoming_events) - 1 else "│  └─"
            lines.append(f"{sub_prefix} {name:<26} │ 距离开赛 {days:>3} 天")

    if active:
        lines.append(f"└─ ✅ 准入 ({len(active)} 条):")
        for i, tournament in enumerate(active):
            sub_prefix = "   ├─" if i < len(active) - 1 else "   └─"
            lines.append(f"{sub_prefix} {tournament['name']:<26} │ {tournament['leagueShort']}")

    log_tree(lines)


def log_active_table(active: list) -> None:
    log("")
    log("✅ 最终结果")

    if active:
        log(f"┌────┬{'─'*28}┬─────────────┬────────────┬────────────┐")
        log(f"│ #  │ {'Tournament':<26} │ {'LeagueShort':<11} │ {'Start':<10} │ {'End':<10} │")
        log(f"├────┼{'─'*28}┼─────────────┼────────────┼────────────┤")
        for i, tournament in enumerate(active):
            log(f"│ {i+1:<2} │ {tournament['name']:<26} │ {tournament['leagueShort']:<11} │ {tournament['startDate']:<10} │ {tournament['endDate']:<10} │")
        log(f"└────┴{'─'*28}┴─────────────┴────────────┴────────────┘")
    else:
        log("  (无准入赛事)")


def attach_transition_team_maps(
    session,
    url: str,
    transition: dict,
) -> None:
    attach_team_maps(
        session,
        url,
        transition["active"] + transition["archive"],
    )


def attach_transition_participant_counts(
    session,
    url: str,
    transition: dict,
) -> None:
    attach_participant_counts(
        session,
        url,
        transition["active"] + transition["archive"],
    )


def attach_transition_participant_groups(
    session,
    url: str,
    transition: dict,
) -> None:
    attach_participant_groups(
        session,
        url,
        transition["active"] + transition["archive"],
    )


def build_manifest(old_active: list, transition: dict) -> dict:
    return build_transition_manifest(
        old_active,
        transition["active"],
        transition["archivedNames"],
        transition["droppedNames"],
    )


def write_config(active: list, archive: list) -> None:
    config = build_tournament_config(active, archive)
    with open(TOURNAMENT_CONFIG_FILE, "w", encoding="utf-8") as file:
        json.dump(config, file, indent=4, ensure_ascii=False)
        file.write("\n")


def format_change_group(symbol: str, names: list, summarize: bool) -> str:
    if not names:
        raise ValueError("Change group names must be non-empty")
    if summarize:
        return f"{symbol}{len(names)}"
    return ", ".join(f"{symbol}{name}" for name in names)


def format_change_parts(
    add_names: list,
    update_names: list,
    remove_names: list,
    summarize: bool = False,
) -> str:
    parts = []
    if add_names:
        parts.append(format_change_group("+", add_names, summarize))
    if update_names:
        parts.append(format_change_group("~", update_names, summarize))
    if remove_names:
        parts.append(format_change_group("-", remove_names, summarize))
    return "; ".join(parts)


def build_change_summary(manifest: dict) -> dict:
    active_removed = sorted(manifest["activeArchivedNames"] + manifest["activeDroppedNames"])
    total_changes = sum((
        len(manifest["activeAddedNames"]),
        len(manifest["activeUpdatedNames"]),
        len(active_removed),
        len(manifest["archiveAddedNames"]),
    ))
    active_parts = format_change_parts(
        manifest["activeAddedNames"],
        manifest["activeUpdatedNames"],
        active_removed,
    )
    archive_parts = format_change_parts(
        manifest["archiveAddedNames"],
        [],
        [],
    )
    return {
        "activeParts": active_parts,
        "archiveParts": archive_parts,
        "totalChanges": total_changes,
    }


def build_commit_message(manifest: dict, summary: dict) -> str:
    active_removed = manifest["activeArchivedNames"] + manifest["activeDroppedNames"]
    if summary["totalChanges"] > 5:
        active_parts = format_change_parts(
            manifest["activeAddedNames"],
            manifest["activeUpdatedNames"],
            active_removed,
            summarize=True,
        )
        archive_parts = format_change_parts(
            manifest["archiveAddedNames"],
            [],
            [],
            summarize=True,
        )
    else:
        active_parts = summary["activeParts"]
        archive_parts = summary["archiveParts"]

    if not active_parts and not archive_parts:
        return "🎯 Tour: no changes"

    sections = []
    if active_parts:
        sections.append(f"Active ({active_parts})")
    if archive_parts:
        sections.append(f"Archive ({archive_parts})")
    return f"🎯 Tour: {' | '.join(sections)}"


def log_change_summary(source_count: int, active_count: int, archive_count: int, summary: dict) -> None:
    log("")
    log(f"📊 Summary | {f'Candidates: {source_count}':<14} | {f'Active: {active_count}':<10} | {f'Archive: {archive_count}':<10}")
    log(f"📝 {'Active':<7} | {summary['activeParts'] or 'No changes'}")
    log(f"🗄️ {'Archive':<7} | {summary['archiveParts'] or 'No changes'}")


def write_github_outputs(commit_message: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as file:
        file.write(f"commit_msg={commit_message}\n")


# ==================== 主流程 ====================

def run_tournament_config_sync():
    start_time = time.time()
    old_config = load_tournament_config(TOURNAMENT_CONFIG_FILE)
    old_active = old_config["active"]
    old_archive = old_config["archive"]
    url = "https://lol.fandom.com/api.php"
    session = make_session(url, os.environ.get("FANDOM_BOT_USERNAME"), os.environ.get("FANDOM_BOT_PASSWORD"))
    discovery_rows = fetch_tournament_source_rows(session, url, old_active)
    active_overview_pages = {
        page
        for tournament in old_active
        for page in overview_page_names(tournament)
    }
    discovery_classification = classify_tournament_rows(
        discovery_rows,
        active_overview_pages,
    )
    selected_overview_pages = {
        item["title"]["OverviewPage"]
        for item in discovery_classification["eligibleRows"]
    }
    tab_memberships = read_tournament_tab_memberships(
        session,
        url,
        sorted(selected_overview_pages),
    )
    discovery_pages = {
        item["title"]["OverviewPage"]
        for item in discovery_rows
    }
    scope_rows = read_tournament_rows(
        session,
        url,
        sorted(set(tab_memberships["memberPages"]) - discovery_pages),
    )
    source_rows = deduplicate_source_rows(discovery_rows + scope_rows)
    classification = classify_tournament_rows(source_rows, active_overview_pages)
    fandom_leagues = collect_fandom_leagues(classification["eligibleRows"])
    league_short_map = read_league_group_short_map(session, url, fandom_leagues) if fandom_leagues else {}
    node_result = build_tournament_nodes(
        classification["eligibleRows"],
        league_short_map,
        tab_memberships["scopeByPage"],
        active_overview_pages,
    )
    carried_over_from = read_carried_over_from(
        session,
        url,
        sorted(node_result["nodes"]),
    )
    log(
        f"📥 抓取完成 | 发现: {len(discovery_rows)} 条 | "
        f"作用域补全: {len(scope_rows)} 条 | 总计: {len(source_rows)} 条 | "
        f"耗时: {time.time() - start_time:.1f}s"
    )

    groups = group_tournament_nodes(
        node_result["nodes"],
        selected_overview_pages,
        carried_over_from,
    )
    log_group_summary(
        len(source_rows),
        classification,
        groups,
        node_result["deferredRows"],
    )

    candidates = project_tournament_candidates(groups["mainEvents"])
    transition = resolve_config_transition(old_active, old_archive, candidates)
    log_lifecycle_summary(transition)
    log_active_table(transition["active"])

    attach_transition_team_maps(session, url, transition)
    attach_transition_participant_counts(session, url, transition)
    attach_transition_participant_groups(session, url, transition)
    assert_configs_disjoint(transition["active"], transition["archive"])
    manifest = build_manifest(old_active, transition)
    write_config(transition["active"], transition["archive"])

    summary = build_change_summary(manifest)
    commit_message = build_commit_message(manifest, summary)
    log_change_summary(
        len(source_rows),
        len(transition["active"]),
        len(transition["archive"]),
        summary,
    )
    write_github_outputs(commit_message)

if __name__ == "__main__":
    run_tournament_config_sync()
