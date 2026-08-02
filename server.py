import hashlib
import json
import os
import sqlite3
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = ROOT / "data" / "tracker.db"


def resolve_db_path():
    candidates = []
    env_db = os.environ.get("DB_PATH")
    if env_db:
        candidates.append(Path(env_db))
    candidates.append(DEFAULT_DB_PATH)
    candidates.append(Path("/tmp") / "horse-breeding-tracker.db")

    for candidate in candidates:
        try:
            candidate.parent.mkdir(parents=True, exist_ok=True)
            probe = candidate.parent / ".write-test"
            with probe.open("a", encoding="utf-8"):
                pass
            probe.unlink(missing_ok=True)
            return candidate
        except (OSError, PermissionError):
            continue

    return DEFAULT_DB_PATH


DB_PATH = resolve_db_path()
PORT = int(os.environ.get("PORT", "3000"))


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


class TrackerHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self._pending_cookies = []

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api(parsed.path)
            return

        if parsed.path in {"/", "/index.html"}:
            self.serve_file("index.html")
            return

        file_path = (ROOT / parsed.path.lstrip("/")).resolve()
        if file_path.exists() and file_path.is_file() and str(file_path).startswith(str(ROOT)):
            self.serve_file(parsed.path.lstrip("/"))
            return

        self.serve_file("index.html")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api(parsed.path)
            return
        self.send_error(404, "Not found")

    def handle_api(self, path: str):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            if path == "/api/auth/status":
                self.api_auth_status(conn)
            elif path == "/api/register":
                self.api_register(conn)
            elif path == "/api/login":
                self.api_login(conn)
            elif path == "/api/logout":
                self.api_logout(conn)
            elif path == "/api/records":
                self.api_records(conn)
            else:
                self.send_json(404, {"error": "Not found"})
        finally:
            conn.close()

    def api_auth_status(self, conn):
        user_id = self.get_user_id(conn)
        if not user_id:
            self.send_json(200, {"authenticated": False})
            return
        user = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            self.clear_session(conn)
            self.send_json(200, {"authenticated": False})
            return
        self.send_json(200, {"authenticated": True, "user": {"id": user["id"], "username": user["username"]}})

    def api_register(self, conn):
        body = self.read_json_body()
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        if not username or not password:
            self.send_json(400, {"error": "Please provide a username and password."})
            return
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(password)),
            )
            conn.commit()
            user_id = cursor.lastrowid
            session_id = self.create_session(conn, user_id)
            self.set_session_cookie(session_id)
            self.send_json(200, {"user": {"id": user_id, "username": username}})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "That username is already taken."})

    def api_login(self, conn):
        body = self.read_json_body()
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        if not username or not password:
            self.send_json(400, {"error": "Please provide a username and password."})
            return
        user = conn.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if not user or user["password_hash"] != hash_password(password):
            self.send_json(401, {"error": "Invalid username or password."})
            return
        session_id = self.create_session(conn, user["id"])
        self.set_session_cookie(session_id)
        self.send_json(200, {"user": {"id": user["id"], "username": user["username"]}})

    def api_logout(self, conn):
        self.clear_session(conn)
        self.send_json(200, {"ok": True})

    def api_records(self, conn):
        user_id = self.get_user_id(conn)
        if not user_id:
            self.send_json(401, {"error": "Please log in first."})
            return
        if self.command == "GET":
            row = conn.execute("SELECT payload FROM records WHERE user_id = ?", (user_id,)).fetchone()
            records = json.loads(row["payload"]) if row else []
            self.send_json(200, {"records": records})
            return
        if self.command == "POST":
            payload = self.read_json_body()
            conn.execute(
                "INSERT INTO records (user_id, payload) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP",
                (user_id, json.dumps(payload)),
            )
            conn.commit()
            self.send_json(200, {"ok": True})
            return
        self.send_json(405, {"error": "Method not allowed"})

    def get_user_id(self, conn):
        session_id = self.get_cookie("sessionid")
        if not session_id:
            return None
        row = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (session_id,)).fetchone()
        return row["user_id"] if row else None

    def create_session(self, conn, user_id):
        session_id = uuid.uuid4().hex
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("INSERT INTO sessions (id, user_id) VALUES (?, ?)", (session_id, user_id))
        conn.commit()
        return session_id

    def clear_session(self, conn):
        session_id = self.get_cookie("sessionid")
        if session_id:
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()
        self.set_cookie("sessionid", "", max_age=0)

    def get_cookie(self, name: str):
        cookie_header = self.headers.get("Cookie", "")
        for part in cookie_header.split(";"):
            key, _, value = part.strip().partition("=")
            if key == name:
                return value
        return None

    def set_session_cookie(self, session_id: str):
        self.set_cookie("sessionid", session_id, max_age=60 * 60 * 24 * 7)

    def set_cookie(self, name: str, value: str, max_age: int = None):
        cookie = f"{name}={value}; Path=/; HttpOnly; SameSite=Lax"
        if max_age is not None:
            cookie += f"; Max-Age={max_age}"
        self._pending_cookies.append(cookie)

    def send_headers(self, status_code: int, extra_headers=None):
        self.send_response(status_code)
        if extra_headers:
            for name, value in extra_headers:
                self.send_header(name, value)
        for cookie in self._pending_cookies:
            self.send_header("Set-Cookie", cookie)
        self._pending_cookies.clear()
        self.end_headers()

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            return json.loads(body) if body else {}
        except json.JSONDecodeError:
            return {}

    def send_json(self, status_code: int, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_headers(
            status_code,
            extra_headers=[
                ("Content-Type", "application/json; charset=utf-8"),
                ("Content-Length", str(len(body))),
            ],
        )
        self.wfile.write(body)

    def serve_file(self, relative_path: str):
        path = (ROOT / relative_path).resolve()
        if not str(path).startswith(str(ROOT)):
            path = ROOT / "index.html"
        if not path.exists() or not path.is_file():
            path = ROOT / "index.html"
        content = path.read_bytes()
        self.send_headers(
            HTTPStatus.OK,
            extra_headers=[
                ("Content-Type", self.mime_type(path)),
                ("Content-Length", str(len(content))),
            ],
        )
        self.wfile.write(content)

    def mime_type(self, path: Path):
        if path.suffix.lower() == ".html":
            return "text/html; charset=utf-8"
        if path.suffix.lower() == ".css":
            return "text/css; charset=utf-8"
        if path.suffix.lower() == ".js":
            return "application/javascript; charset=utf-8"
        if path.suffix.lower() == ".json":
            return "application/json; charset=utf-8"
        if path.suffix.lower() == ".png":
            return "image/png"
        if path.suffix.lower() == ".svg":
            return "image/svg+xml"
        return "application/octet-stream"


if __name__ == "__main__":
    init_db()
    port = PORT
    server = ThreadingHTTPServer(("0.0.0.0", port), TrackerHandler)
    print(f"Server listening on http://0.0.0.0:{port}")
    server.serve_forever()
