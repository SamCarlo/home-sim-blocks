#!/usr/bin/env python3
"""Serve the game (HS/app) for manual testing. No API: everything runs in the browser.

Run:  python3 tools/serve.py          (then open http://127.0.0.1:1271)
      python3 tools/serve.py 8080     (different port)

Bound to 127.0.0.1 only. HTML is sent with Cache-Control: no-store so a reload
always picks up edits; ES modules need correct MIME types or the browser refuses them.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path
from socketserver import ThreadingTCPServer

APP = Path(__file__).resolve().parent.parent / "app"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 1271


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".css": "text/css; charset=utf-8",
        ".wasm": "application/wasm",
        ".aff": "text/plain; charset=utf-8",
        ".dic": "text/plain; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path.endswith(".html") or path.endswith("/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quiet: only errors
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


class Server(ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), partial(Handler, directory=str(APP))) as httpd:
        print(f"Home & Life Sim at http://127.0.0.1:{PORT}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
