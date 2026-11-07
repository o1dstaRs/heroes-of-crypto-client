"""Local Suno MCP transport using Codex's existing OAuth session.

The ephemeral thread only hosts MCP connections: no model turn or coding agent
is started. Credentials stay in Codex; only these audio tools can be called.
"""

import atexit
import json
from pathlib import Path
import queue
import re
import shutil
import subprocess
import threading
import time


class SunoToolError(RuntimeError):
    def __init__(self, tool, code, reason=None):
        self.tool = tool
        self.code = code if isinstance(code, str) and re.fullmatch(r"[a-z_0-9]{1,80}", code) else "tool_error"
        self.reason = reason if isinstance(reason, str) and re.fullmatch(r"[a-z_0-9]{1,80}", reason) else None
        if tool == "audio-download" and self.code == "insufficient_credits":
            message = "Suno generated this take, but it has no download credits available. Generation and download credits are separate."
        elif tool == "sounds-create" and self.code == "insufficient_credits":
            message = "Suno rejected generation because there are insufficient generation credits."
        elif self.code == "rate_limited":
            message = "Suno rate-limited the request. Wait briefly, then resume this batch."
        else:
            message = "Suno " + tool + " returned " + self.code + "."
        super().__init__(message)


class SunoMcp:
    TOOLS = {"account-usage", "sounds-create", "audio-retrieve", "audio-download"}

    def __init__(self, cwd):
        self.cwd = Path(cwd)
        self.lock = threading.Lock()
        self.process = None
        self.thread_id = None
        self.sequence = 0
        self.last_download_at = 0
        self.messages = queue.Queue()
        atexit.register(self.close)

    def close(self):
        process, self.process = self.process, None
        self.thread_id = None
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            for stream in (process.stdin, process.stdout):
                if stream:
                    stream.close()

    @staticmethod
    def _read(process, messages):
        try:
            for line in process.stdout:
                try:
                    messages.put(json.loads(line))
                except json.JSONDecodeError:
                    continue
        except (OSError, ValueError):
            pass  # The owned process/pipe may close during server shutdown.
        finally:
            messages.put(None)

    def _send(self, message):
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def _rpc(self, method, params, timeout=90):
        self.sequence += 1
        request_id = self.sequence
        self._send({"id": request_id, "method": method, "params": params})
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                message = self.messages.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty:
                break
            if message is None:
                raise RuntimeError("Suno MCP connection ended. Reconnect Suno in Codex.")
            if "method" in message:
                if "id" in message:
                    # Never accept an OAuth/permission prompt on the user's behalf.
                    self._send({"id": message["id"], "error": {
                        "code": -32601, "message": "Complete this request in Codex, then retry."}})
                continue
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise RuntimeError("Suno MCP request failed. Check the Suno connection in Codex.")
            return message.get("result", {})
        raise TimeoutError("Suno MCP timed out. The creation request was not automatically repeated.")

    def _connect(self):
        if self.process is not None and self.process.poll() is None and self.thread_id:
            return
        self.close()
        executable = shutil.which("codex")
        if not executable:
            raise RuntimeError("Install Codex CLI and connect Suno before using Suno generation.")
        self.messages = queue.Queue()
        self.process = subprocess.Popen(
            [executable, "app-server", "--listen", "stdio://"], cwd=self.cwd,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1,
        )
        threading.Thread(target=self._read, args=(self.process, self.messages), daemon=True).start()
        try:
            self._rpc("initialize", {"clientInfo": {"name": "hoc_audio_review", "version": "1.0"},
                                     "capabilities": {"experimentalApi": True}})
            self._send({"method": "initialized", "params": {}})
            result = self._rpc("thread/start", {"cwd": str(self.cwd), "ephemeral": True})
            self.thread_id = result["thread"]["id"]
            status = self._rpc("mcpServerStatus/list", {
                "threadId": self.thread_id, "serverName": "suno", "detail": "toolsAndAuthOnly"})
            server = next((s for s in status.get("data", []) if s.get("name") == "suno"), {})
            tools = server.get("tools", {})
            names = set(tools) if isinstance(tools, dict) else {t["name"] for t in tools}
            if not self.TOOLS <= names:
                raise RuntimeError("Connect Suno MCP in Codex and sign in with codex mcp login suno.")
        except Exception:
            self.close()
            raise

    def call(self, name, arguments):
        if name not in self.TOOLS:
            raise ValueError("This tool is not used by the sound review page")
        with self.lock:
            self._connect()
            if name == "audio-download":
                time.sleep(max(0, 1.1 - (time.monotonic() - self.last_download_at)))
                self.last_download_at = time.monotonic()
            result = self._rpc("mcpServer/tool/call", {
                "threadId": self.thread_id, "server": "suno", "tool": name, "arguments": arguments})
            payload = result.get("structuredContent")
            if not isinstance(payload, dict):
                for item in result.get("content", []):
                    if item.get("type") == "text":
                        try:
                            payload = json.loads(item["text"])
                            break
                        except json.JSONDecodeError:
                            continue
            if result.get("isError") or not isinstance(payload, dict):
                code = payload.get("code", "tool_error") if isinstance(payload, dict) else "tool_error"
                reason = payload.get("reason") if isinstance(payload, dict) else None
                raise SunoToolError(name, code, reason)
            return payload
