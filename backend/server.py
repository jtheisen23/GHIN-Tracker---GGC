#!/usr/bin/env python3
import json
import os
import secrets
import time
from dataclasses import dataclass, field
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import (
    HTTPCookieProcessor,
    Request,
    build_opener,
)


LOGIN_URL = "https://api2.ghin.com/api/v1/golfer_login.json"
API_BASE = "https://api.ghin.com/api/v1"
API2_BASE = "https://api2.ghin.com/api/v1"
PORT = int(os.environ.get("PORT", "8787"))
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "43200"))
USER_AGENT = os.environ.get("GHIN_TRACKER_USER_AGENT", "GHIN-Tracker-GGC/1.0")


@dataclass
class GhinSession:
    session_id: str
    token: str
    username: str
    golfer_id: str
    golfer_name: str
    association_id: str
    opener: object
    directory_golfers: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


SESSIONS: dict[str, GhinSession] = {}


def default_headers(extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
        "Origin": "https://www.ghin.com",
        "Referer": "https://www.ghin.com/golfer-lookup/all-golfers",
    }
    if extra:
        headers.update(extra)
    return headers


def prune_sessions() -> None:
    cutoff = time.time() - SESSION_TTL_SECONDS
    expired = [session_id for session_id, session in SESSIONS.items() if session.updated_at < cutoff]
    for session_id in expired:
        SESSIONS.pop(session_id, None)


def normalize_golfers(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        golfers = payload.get("golfers")
        if isinstance(golfers, list):
            return golfers
        golfers = payload.get("Golfers")
        if isinstance(golfers, list):
            return golfers
        golfer = payload.get("golfer")
        if isinstance(golfer, dict):
            return [golfer]
    return []


def extract_scores(payload: object) -> list[dict]:
    if isinstance(payload, dict):
        scores = payload.get("scores")
        if isinstance(scores, list):
            return scores
        scores = payload.get("Scores")
        if isinstance(scores, list):
            return scores
    return []


def normalize_name(value: str) -> str:
    return str(value).strip().lower()


def format_last_round_value(scores: list[dict]) -> Optional[str]:
    candidates: list[str] = []
    for score in scores:
        for key in ("played_at", "score_day_1", "date_played"):
            value = score.get(key)
            if value:
                candidates.append(str(value))
                break
    if not candidates:
        return None
    return max(candidates)


def build_attempts(query: str, association_id: str = "") -> list[str]:
    trimmed = query.strip()
    attempts: list[str] = []
    association_suffix = f"&association_id={quote(association_id)}" if association_id else ""
    suffix = f"&sorting_criteria=id&order=ASC&status=Active{association_suffix}"

    if trimmed.isdigit():
        attempts.append(
            f"{API_BASE}/golfers/search.json?per_page=25&page=1&golfer_id={quote(trimmed)}{suffix}"
        )
        attempts.append(
            f"{API_BASE}/golfers/search.json?per_page=25&page=1&ghin_number={quote(trimmed)}{suffix}"
        )
        attempts.append(
            f"{API2_BASE}/golfers/search.json?per_page=25&page=1&golfer_id={quote(trimmed)}{association_suffix}"
        )
        attempts.append(
            f"{API2_BASE}/golfers/search.json?per_page=25&page=1&ghin_number={quote(trimmed)}{association_suffix}"
        )
        return attempts

    if association_id:
        attempts.append(
            f"{API_BASE}/golfers/search.json?per_page=25&page=1&last_name={quote(trimmed)}{suffix}"
        )
        attempts.append(
            f"{API2_BASE}/golfers/search.json?per_page=25&page=1&last_name={quote(trimmed)}{association_suffix}"
        )
    return attempts


def fetch_json(opener: object, url: str, headers: dict[str, str], method: str = "GET", body: object = None) -> object:
    encoded_body = None
    request_headers = default_headers(headers)
    if body is not None:
        encoded_body = json.dumps(body).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"
    request = Request(url, data=encoded_body, headers=request_headers, method=method)
    with opener.open(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def login_to_ghin(username: str, password: str) -> tuple[Optional[GhinSession], Optional[str]]:
    jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    payload = {
        "user": {
            "email_or_ghin": username,
            "password": password,
            "remember_me": "true",
        },
        "token": "server",
    }

    try:
        data = fetch_json(opener, LOGIN_URL, {}, method="POST", body=payload)
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
        except Exception:
            payload = {}
        return None, payload.get("message") or payload.get("error") or f"HTTP {error.code}"
    except URLError as error:
        return None, str(error.reason)
    except Exception as error:
        return None, str(error)

    golfer_user = data.get("golfer_user") if isinstance(data, dict) else None
    if not isinstance(golfer_user, dict):
        return None, "GHIN login did not return golfer_user data."

    token = str(golfer_user.get("golfer_user_token") or "").strip()
    golfer_id = str(
        golfer_user.get("ghin_number")
        or golfer_user.get("golfer_id")
        or golfer_user.get("id")
        or ""
    ).strip()
    golfer_name = " ".join(
        part for part in [golfer_user.get("first_name"), golfer_user.get("last_name")] if part
    ).strip() or username
    association_id = str(
        golfer_user.get("association_id")
        or golfer_user.get("golf_association_id")
        or ""
    ).strip()

    if not token or not golfer_id:
        return None, "GHIN login succeeded but did not return a usable token and golfer id."

    session = GhinSession(
        session_id=secrets.token_urlsafe(24),
        token=token,
        username=username,
        golfer_id=golfer_id,
        golfer_name=golfer_name,
        association_id=association_id,
        opener=opener,
    )
    session.directory_golfers, _ = fetch_member_list(session)
    SESSIONS[session.session_id] = session
    return session, None


def ghin_request(session: GhinSession, url: str) -> object:
    attempts = [
        {"Authorization": f"Bearer {session.token}"},
        {"Authorization": f'Token token="{session.token}"'},
    ]
    last_error = None
    session.updated_at = time.time()

    for headers in attempts:
        try:
            return fetch_json(session.opener, url, headers)
        except HTTPError as error:
            try:
                payload = json.loads(error.read().decode("utf-8"))
            except Exception:
                payload = {}
            last_error = payload.get("message") or payload.get("error") or f"HTTP {error.code}"
        except URLError as error:
            last_error = str(error.reason)
        except Exception as error:
            last_error = str(error)

    raise RuntimeError(last_error or "Request failed")


def fetch_member_list(session: GhinSession) -> tuple[list[dict], Optional[str]]:
    try:
        payload = ghin_request(session, f"{API_BASE}/golfers.json?per_page=200&page=1")
    except Exception as error:
        return [], str(error)
    golfers = normalize_golfers(payload)
    return golfers, None


def find_local_last_name_matches(session: GhinSession, query: str) -> list[dict]:
    if not session.directory_golfers or query.strip().isdigit():
        return []

    normalized_query = normalize_name(query)
    matches = []
    for golfer in session.directory_golfers:
        last_name = normalize_name(golfer.get("last_name", ""))
        full_name = normalize_name(
            (f"{golfer.get('first_name', '')} {golfer.get('last_name', '')}".strip())
            or golfer.get("player_name", "")
        )
        if last_name.startswith(normalized_query) or normalized_query in full_name:
            matches.append(golfer)
    return matches


def fetch_last_round_posted(session: GhinSession, golfer_id: str) -> tuple[Optional[str], Optional[str]]:
    today = time.strftime("%Y-%m-%d")
    current_year = int(time.strftime("%Y"))
    from_date = f"{current_year - 3}-01-01"
    search_url = (
        f"{API_BASE}/scores/search.json?per_page=10&page=1"
        f"&golfer_id={quote(golfer_id)}"
        f"&from_date_played={from_date}"
        f"&to_date_played={today}"
    )
    fallback_url = f"{API_BASE}/golfers/{quote(golfer_id)}/scores.json?per_page=10&page=1"

    for url in (search_url, fallback_url):
        try:
            payload = ghin_request(session, url)
            last_round = format_last_round_value(extract_scores(payload))
            if last_round:
                return last_round, None
        except Exception as error:
            last_error = str(error)
        else:
            last_error = "No rounds returned"

    return None, last_error


def search_golfers(session: GhinSession, query: str) -> tuple[list[dict], dict]:
    diagnostics = {
        "directory_count": len(session.directory_golfers),
        "used_local_directory": False,
        "search_error": None,
    }
    golfers = find_local_last_name_matches(session, query)
    if golfers:
        diagnostics["used_local_directory"] = True
        return golfers, diagnostics

    attempts = build_attempts(query, session.association_id)
    last_error = None

    for url in attempts:
        try:
            payload = ghin_request(session, url)
            golfers = normalize_golfers(payload)
            if golfers:
                return golfers, diagnostics
        except Exception as error:
            last_error = str(error)

    if not query.strip().isdigit() and not session.association_id:
        diagnostics["search_error"] = (
            "GHIN last-name search needs club or association context for this account, and GHIN "
            "did not return that directory data here. Exact GHIN number search still works best."
        )
        return [], diagnostics

    if last_error and "golfer_id, last_name and state, last_name and country" in last_error:
        diagnostics["search_error"] = (
            "GHIN last-name search needs narrower lookup filters for this account. Exact GHIN "
            "number search still works best right now."
        )
        return [], diagnostics

    diagnostics["search_error"] = last_error
    return [], diagnostics


def enrich_golfers_with_last_round(session: GhinSession, golfers: list[dict]) -> tuple[list[dict], list[dict]]:
    enriched = []
    last_round_results = []

    for golfer in golfers:
        golfer_copy = dict(golfer)
        golfer_id = str(golfer_copy.get("ghin_number") or golfer_copy.get("id") or "").strip()
        last_round_posted, last_round_error = (None, None)
        if golfer_id:
            last_round_posted, last_round_error = fetch_last_round_posted(session, golfer_id)
            if last_round_posted:
                golfer_copy["backend_last_round_posted"] = last_round_posted
        last_round_results.append(
            {
                "golfer_id": golfer_id,
                "last_round_posted": last_round_posted,
                "last_round_error": last_round_error,
            }
        )
        enriched.append(golfer_copy)

    return enriched, last_round_results


class Handler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        prune_sessions()
        if self.path == "/health":
            self.respond(200, {"ok": True, "sessions": len(SESSIONS)})
            return
        self.respond(404, {"error": "Not found"})

    def do_POST(self) -> None:
        prune_sessions()
        if self.path == "/api/ghin/login":
            self.handle_login()
            return
        if self.path == "/api/ghin/search-golfers":
            self.handle_search()
            return
        self.respond(404, {"error": "Not found"})

    def handle_login(self) -> None:
        payload = self.read_json()
        if payload is None:
            return

        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", "")).strip()
        if not username or not password:
            self.respond(400, {"error": "Missing username or password"})
            return

        session, error = login_to_ghin(username, password)
        if error or session is None:
            self.respond(502, {"error": error or "GHIN login failed"})
            return

        self.respond(
            200,
            {
                "session_id": session.session_id,
                "golfer_id": session.golfer_id,
                "golfer_name": session.golfer_name,
                "association_id": session.association_id,
                "directory_count": len(session.directory_golfers),
            },
        )

    def handle_search(self) -> None:
        payload = self.read_json()
        if payload is None:
            return

        session_id = str(payload.get("session_id", "")).strip()
        query = str(payload.get("query", "")).strip()
        if not session_id:
            self.respond(400, {"error": "Missing backend session id"})
            return
        if not query:
            self.respond(400, {"error": "Missing search query"})
            return

        session = SESSIONS.get(session_id)
        if session is None:
            self.respond(401, {"error": "Backend session not found or expired"})
            return

        golfers, diagnostics = search_golfers(session, query)
        enriched, last_round_results = enrich_golfers_with_last_round(session, golfers)
        self.respond(
            200,
            {
                "golfers": enriched,
                "diagnostics": {
                    **diagnostics,
                    "last_round_results": last_round_results,
                },
            },
        )

    def read_json(self) -> Optional[dict]:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            self.respond(400, {"error": "Invalid JSON body"})
            return None

    def log_message(self, format: str, *args) -> None:
        return

    def respond(self, status: int, payload: dict) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"GHIN backend listening on http://127.0.0.1:{PORT}")
    server.serve_forever()
