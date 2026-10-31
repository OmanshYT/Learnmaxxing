#!/usr/bin/env python3
"""Local dev server for the static site, with live reload.

Usage:  python3 dev/serve.py [port]

Serves the repo root, injects a tiny reload script into HTML responses, and
reloads the browser when any .html/.js/.css/.py file (or anything under files/)
changes. Dev-only: never deploy this file.
"""
import http.server
import os
import socketserver
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH_DIRS = ["", "files"]
WATCH_EXT = (".html", ".js", ".css", ".py", ".json", ".md")

LR_CLIENT = b"""
<script>
(() => {
  let es;
  const connect = () => {
    es = new EventSource("/__reload");
    es.onmessage = () => location.reload();
    es.onerror = () => { es.close(); setTimeout(connect, 1000); };
  };
  connect();
})();
</script>
"""


def snapshot():
    state = {}
    for d in WATCH_DIRS:
        base = os.path.join(ROOT, d) if d else ROOT
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in (".git", "node_modules", "dev", "__pycache__")]
            for name in filenames:
                if d and not name.lower().endswith(WATCH_EXT):
                    continue
                if not d and not name.lower().endswith(WATCH_EXT):
                    continue
                path = os.path.join(dirpath, name)
                try:
                    state[path] = os.stat(path).st_mtime_ns
                except OSError:
                    pass
    return state


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.startswith("/__"):
            self.send_header("Cache-Control", "no-store")
        elif self.path.endswith((".html", ".js", ".css", "/")) or "." not in os.path.basename(self.path):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/__reload":
            return self.stream()
        if self.path.split("?")[0] == "/__lr.js":
            body = LR_CLIENT
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        last = snapshot()
        try:
            while True:
                time.sleep(0.4)
                now = snapshot()
                if now != last:
                    last = now
                    self.wfile.write(b"data: reload\n\n")
                    self.wfile.flush()
                else:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if not path.endswith(".html") or not os.path.isfile(path):
            return super().send_head()
        with open(path, "rb") as f:
            html = f.read()
        inject = b'<script src="/__lr.js"></script>\n</body>'
        if b"</body>" in html:
            html = html.replace(b"</body>", inject, 1)
        else:
            html += b"\n" + inject
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        import io

        return io.BytesIO(html)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    with Server(("0.0.0.0", port), Handler) as httpd:
        print(f"serving {ROOT} on 0.0.0.0:{port}", flush=True)
        httpd.serve_forever()
