#!/usr/bin/env python3
"""
AI 杭州导游 - 本地开发代理服务器（可选）

作用：
1. 以静态文件方式托管本项目，浏览器访问 http://localhost:8080 即可使用；
2. 转发 /api/chat 请求，解决部分大模型 API（如 OpenAI 官方）不允许浏览器
   直接跨域调用（CORS）的问题。

使用方法：
    python server.py
然后在网页"设置 API"中，把"本地代理地址"填为：
    http://localhost:8080/api/chat

依赖：仅 Python 3 标准库，无需安装任何第三方包。
"""

import json
import mimetypes
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8080
ROOT = Path(__file__).resolve().parent

# 转发到目标 API 的超时时间（秒）
UPSTREAM_TIMEOUT = 60


class Handler(BaseHTTPRequestHandler):
    server_version = "HangzhouGuideProxy/1.0"

    # ---------- 静态文件 ----------
    def do_GET(self):
        path = ROOT / self.path.lstrip("/")
        if path.is_dir():
            path = path / "index.html"
        if not path.is_file():
            self.send_error(404)
            return

        ctype, _ = mimetypes.guess_type(str(path))
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- API 转发 ----------
    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": {"message": "请求体不是合法的 JSON"}})
            return

        endpoint = payload.pop("endpoint", None)
        if not endpoint:
            self._send_json(400, {"error": {"message": "缺少 endpoint 字段"}})
            return

        auth = self.headers.get("Authorization", "")
        try:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": auth,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
                body = resp.read()
            self._send_json(resp.status, json.loads(body or b"{}"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")
            try:
                self._send_json(e.code, json.loads(detail))
            except json.JSONDecodeError:
                self._send_json(e.code, {"error": {"message": detail}})
        except Exception as e:
            self._send_json(502, {"error": {"message": f"上游请求失败: {e}"}})

    def _send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"AI 杭州导游 - 本地服务器已启动：http://localhost:{PORT}")
    print(f"本地代理地址（设置 API 中填写）：http://localhost:{PORT}/api/chat")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
