#!/usr/bin/env python3
"""Local combat-audio audition, generation, and take-selection service.

Run from the repository root. ELEVENLABS_API_KEY stays in the server environment;
it is never sent to the browser or written to a report. Generation is explicitly
started by the review UI; applying a take updates local game assets and metadata.
"""

import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import threading
import urllib.error
import urllib.parse
import urllib.request

from prepare_combat_audio import CORE, master, write_review

WORK = CORE / "tmp/audio"
JOBS = WORK / "revisions"


def save_json(path, data, indent=2):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".writing")
    temporary.write_text(json.dumps(data, indent=indent) + "\n")
    temporary.replace(path)


def design_entry(slug, role):
    if role not in ("attack", "hurt"):
        raise ValueError("Unknown combat sound role")
    design = json.loads((CORE / "audio/combat-sound-design.json").read_text())
    unit = next((u for u in design["units"] if u["slug"] == slug), None)
    if not unit:
        raise ValueError("Unknown creature")
    return unit, unit[role]


def prepare_candidate(job, index, path, source):
    unit, _ = design_entry(job["slug"], job["role"])
    key = job["slug"] + "/" + job["role"]
    folder = JOBS / job["id"] / str(index)
    source_id = source.get("source_id") or "source-" + hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    record = {"path": path, "unit": unit["name"], "slug": unit["slug"], "role": job["role"],
              "source_id": source_id, "source": source}
    result = master(key, [record], folder, folder / "assets")
    return {"index": index, "label": source.get("label", "Take " + str(index + 1)),
            "source_id": source_id, "source": source, "path": str(path.relative_to(CORE)),
            "asset_base": str((folder / "assets" / key.replace("/", "_")).relative_to(CORE)), "result": result}


def apply_candidate(job, index):
    candidate = next((c for c in job["candidates"] if c["index"] == index), None)
    if not candidate:
        raise ValueError("Take not found or not mastered successfully")
    slug, role = job["slug"], job["role"]
    key = slug + "/" + role
    base = CORE / "public/audio/combat" / key.replace("/", "_")
    staged_files = {codec: CORE / (candidate["asset_base"] + "." + codec) for codec in ("webm", "mp3")}
    if not all(path.is_file() for path in staged_files.values()):
        raise ValueError("Restore both mastered candidate files before applying")
    for codec in ("webm", "mp3"):
        shutil.copyfile(staged_files[codec], base.with_suffix("." + codec))
    result = candidate["result"]
    revision = hashlib.sha256(base.with_suffix(".webm").read_bytes() + base.with_suffix(".mp3").read_bytes()).hexdigest()[:10]
    overrides_path = CORE / "audio/combat-sound-overrides.json"
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    overrides[key] = {k: candidate[k] for k in ("source_id", "path", "source")}
    save_json(overrides_path, overrides, 4)
    source = candidate["source"]
    if source.get("kind") in ("elevenlabs-api", "elevenlabs-mcp") and source.get("prompt"):
        design_path = CORE / "audio/combat-sound-design.json"
        design = json.loads(design_path.read_text())
        unit = next(u for u in design["units"] if u["slug"] == slug)
        unit[role]["prompt"] = source["prompt"]
        save_json(design_path, design, 4)
    manifest_path = CORE / "src/ui/audio/combatSoundManifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest[result["unit"]][role] = {"durationMs": result["encoded"]["webm"]["duration_ms"], "revision": revision}
    save_json(manifest_path, manifest, 4)
    provenance_path = CORE / "audio/combat-sound-provenance.json"
    provenance = json.loads(provenance_path.read_text())
    clip = {k: result[k] for k in ("unit", "slug", "role", "source_id", "source", "encoded")}
    provenance["clips"] = [clip if c["slug"] == slug and c["role"] == role else c for c in provenance["clips"]]
    provenance["provider"] = ("Mixed: see individual clip sources" if any(c.get("source", {}).get("kind")
                              in ("library", "user-provided") for c in provenance["clips"]) else "ElevenLabs")
    save_json(provenance_path, provenance, 4)
    report_path = WORK / "mastering-report.json"
    report = json.loads(report_path.read_text())
    report["clips"] = [result if c["slug"] == slug and c["role"] == role else c for c in report["clips"]]
    write_review(WORK, report["clips"])
    save_json(report_path, report)
    job["applied_index"] = index
    save_json(JOBS / job["id"] / "job.json", job)
    return {"revision": revision, "slug": slug, "role": role}


class ReviewService:
    def __init__(self, api_key=None):
        self.api_key = api_key if api_key is not None else os.environ.get("ELEVENLABS_API_KEY", "")
        self.lock = threading.Lock()
        self.active = None
        self.jobs = {}
        for path in JOBS.glob("*/job.json"):
            job = json.loads(path.read_text())
            # A process restart cannot safely retry an ambiguous charged request.
            if job["status"] == "generating":
                job["status"] = "ready" if job.get("candidates") else "interrupted"
            self.jobs[job["id"]] = job

    def regenerate(self, slug, role, prompt, request_id):
        unit, defaults = design_entry(slug, role)
        if not isinstance(prompt, str) or not 5 <= len(prompt.strip()) <= 1000:
            raise ValueError("Use a sound description between 5 and 1000 characters")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{16,64}", request_id):
            raise ValueError("Invalid generation request ID")
        with self.lock:
            if request_id in self.jobs:
                existing = self.jobs[request_id]
                if (existing["slug"], existing["role"], existing["prompt"]) != (slug, role, prompt.strip()):
                    raise ValueError("This request ID belongs to another generation")
                return existing  # An ambiguous browser retry never starts another paid run.
            if not self.api_key:
                raise ValueError("Set ELEVENLABS_API_KEY in the local server environment")
            if self.active:
                raise ValueError("A generation is already running; wait for its existing takes")
            job = {"id": request_id, "slug": slug, "role": role, "unit": unit["name"],
                   "prompt": prompt.strip(), "status": "generating", "candidates": [], "errors": [],
                   "duration_seconds": defaults["duration_seconds"],
                   "created_at": datetime.now(timezone.utc).isoformat()}
            self.jobs[request_id] = job
            self.active = request_id
            save_json(JOBS / request_id / "job.json", job)
            threading.Thread(target=self.generate, args=(job,), daemon=True).start()
            return job

    def take(self, job, index):
        payload = {"text": job["prompt"], "duration_seconds": job["duration_seconds"],
                   "prompt_influence": 0.7, "loop": False, "model_id": "eleven_text_to_sound_v2"}
        request = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
                  data=json.dumps(payload).encode(), headers={"xi-api-key": self.api_key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                audio = response.read(2_000_001)
                provider_request_id = response.headers.get("request-id") or response.headers.get("x-request-id")
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"ElevenLabs returned HTTP {error.code}; no automatic retry was sent") from None
        if len(audio) > 2_000_000 or len(audio) < 500:
            raise ValueError("Unexpected generated audio size")
        path = JOBS / job["id"] / "raw" / (str(index) + ".mp3")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(audio)
        source = {"kind": "elevenlabs-api", "model": payload["model_id"], "prompt": job["prompt"],
                  "request_id": provider_request_id, "sha256": hashlib.sha256(audio).hexdigest(),
                  "label": "Generated take " + str(index + 1)}
        return prepare_candidate(job, index, path, source)

    def generate(self, job):
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                futures = {executor.submit(self.take, job, i): i for i in range(4)}
                for future in concurrent.futures.as_completed(futures):
                    with self.lock:
                        try:
                            job["candidates"].append(future.result())
                            job["candidates"].sort(key=lambda c: c["index"])
                        except Exception as error:
                            job["errors"].append({"index": futures[future], "message": str(error)[:500]})
                        save_json(JOBS / job["id"] / "job.json", job)
        finally:
            with self.lock:
                job["status"] = "ready" if job["candidates"] else "failed"
                self.active = None
                save_json(JOBS / job["id"] / "job.json", job)


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(CORE), **kwargs)

    def json_response(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        service = self.server.service
        if parsed.path == "/api/audio/catalog":
            report = json.loads((WORK / "mastering-report.json").read_text())
            nodes_file = WORK / "nodes.json"
            flow_id = json.loads(nodes_file.read_text()).get("flow_id") if nodes_file.exists() else None
            return self.json_response(200, {"sounds": report["clips"], "can_generate": bool(service.api_key),
                                      "provider_url": "https://elevenlabs.io/app/flows/" + flow_id if flow_id else None})
        if parsed.path == "/api/audio/jobs":
            query = urllib.parse.parse_qs(parsed.query)
            with service.lock:
                jobs = [j for j in service.jobs.values() if j["slug"] == query.get("slug", [""])[0]
                        and j["role"] == query.get("role", [""])[0]]
                return self.json_response(200, {"jobs": sorted(jobs, key=lambda j: j.get("created_at", ""), reverse=True)})
        if parsed.path.startswith("/api/audio/job/"):
            with service.lock:
                job = service.jobs.get(parsed.path.rsplit("/", 1)[-1])
                return self.json_response(200 if job else 404, job or {"error": "Unknown generation"})
        relative = urllib.parse.unquote(parsed.path)
        path = Path(self.translate_path(relative)).resolve()
        if not path.is_relative_to(CORE.resolve()) or any(p.startswith(".") for p in Path(relative).parts):
            return self.send_error(404)
        super().do_GET()

    def do_POST(self):
        # Local tools may omit Origin; browsers must originate from this exact server.
        origin = self.headers.get("Origin")
        allowed = {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}
        if origin is not None and origin not in allowed:
            return self.json_response(403, {"error": "Use the local audition page"})
        if self.headers.get_content_type() != "application/json":
            return self.json_response(415, {"error": "JSON request required"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 8192:
                raise ValueError("Invalid request size")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError("JSON object required")
            service = self.server.service
            if self.path == "/api/audio/regenerate":
                job = service.regenerate(body.get("slug"), body.get("role"), body.get("prompt"), body.get("request_id"))
                return self.json_response(202, {"id": job["id"], "status": job["status"]})
            if self.path == "/api/audio/apply":
                with service.lock:
                    job = service.jobs.get(body.get("job_id"))
                    if not job or job["status"] not in ("ready", "failed", "interrupted"):
                        raise ValueError("Wait for the completed generation before choosing a take")
                    result = apply_candidate(job, body.get("index"))
                return self.json_response(200, result)
            self.json_response(404, {"error": "Unknown action"})
        except (ValueError, TypeError, KeyError) as error:
            self.json_response(400, {"error": str(error)[:500]})
        except Exception:
            self.json_response(500, {"error": "Local audio processing failed; inspect the local server log"})

    def log_message(self, format, *args):
        # Standard HTTP logging excludes request bodies and the provider's authentication header.
        super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5174)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), ReviewHandler)
    server.service = ReviewService()
    print(f"Audio review: http://127.0.0.1:{args.port}/tmp/audio/review.html", flush=True)
    print("Automatic regeneration available: " + str(bool(server.service.api_key)), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
