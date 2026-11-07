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
import math
import os
from pathlib import Path
import re
import shutil
import signal
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from prepare_combat_audio import CORE, master, spell_placeholders, spell_rows_for_review, write_review
from suno_mcp import SunoMcp, SunoToolError

WORK = CORE / "tmp/audio"
JOBS = WORK / "revisions"
SIMILAR_UNAVAILABLE = (
    "Reference-audio regeneration is not available with the connected short-sound models. "
    "Regenerate creates fresh takes from the sound description."
)


def suno_job_status(job):
    states = {c["state"] for c in job.get("suno_clips", [])}
    if states & {"pending", "download_approved"} or (job.get("creation_sent") and not job.get("suno_clips")):
        return "interrupted"
    if "requires_credit" in states:
        return "needs_download_approval"
    if "download_blocked" in states:
        return "download_blocked"
    return "ready" if job["candidates"] else "failed"


def save_json(path, data, indent=2):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".writing")
    temporary.write_text(json.dumps(data, indent=indent) + "\n")
    temporary.replace(path)


def load_combat_report():
    report_path = WORK / "mastering-report.json"
    if report_path.is_file():
        return json.loads(report_path.read_text())
    # The standalone audition page retains the complete measured clips even when
    # the separate temporary report has been removed. Decode its JSON, never JS.
    page = (WORK / "review.html").read_text()
    assignment = re.search(r"\blet\s+sounds\s*=\s*", page)
    if not assignment:
        raise ValueError("The audition page has no saved sound data")
    clips, _ = json.JSONDecoder().raw_decode(page[assignment.end():])
    if not isinstance(clips, list):
        raise ValueError("The audition page has invalid sound data")
    clips = [clip for clip in clips if clip.get("role") in ("attack", "hurt")]
    if not clips:
        raise ValueError("The audition page has no saved creature sounds")
    return {"clips": clips}


def design_entry(slug, role):
    if role not in ("attack", "hurt"):
        raise ValueError("Unknown combat sound role")
    design = json.loads((CORE / "audio/combat-sound-design.json").read_text())
    unit = next((u for u in design["units"] if u["slug"] == slug), None)
    if not unit:
        raise ValueError("Unknown creature")
    return unit, unit[role]


FREESOUND_CREDENTIALS = Path.home() / ".config/freesound/credentials.json"
FREESOUND_SEARCH = {"query": "spell cast", "filter": 'license:"Creative Commons 0"'}
SPELL_MAX_DURATION_MS = 2500


def freesound_api_key():
    if not FREESOUND_CREDENTIALS.is_file():
        return ""
    return json.loads(FREESOUND_CREDENTIALS.read_text()).get("api_key") or ""


def freesound_record(sound):
    previews = sound.get("previews") or {}
    preview_url = sound.get("preview_url") or previews.get("preview-hq-ogg") or previews.get("preview-hq-mp3") or ""
    username = sound.get("username") or ""
    sound_id = int(sound["id"])
    page = sound.get("page") or (
        "https://freesound.org/people/" + urllib.parse.quote(username, safe="") + "/sounds/" + str(sound_id) + "/"
        if username else "")
    preview = sound.get("preview") or ""
    if preview and Path(preview).name != preview:
        preview = ""
    return {"id": sound_id, "name": sound.get("name") or str(sound_id), "username": username,
            "license": sound.get("license") or "", "duration": sound.get("duration"),
            "preview_url": preview_url, "preview": preview, "page": page}


def saved_freesound_spell_casts():
    folder = WORK / "freesound" / "cc0-spell-cast"
    for name in ("search.json", "index.json"):
        path = folder / name
        if not path.is_file():
            continue
        sounds = []
        for sound in json.loads(path.read_text()).get("sounds", []):
            if "creativecommons.org/publicdomain/zero" not in (sound.get("license") or ""):
                continue
            sounds.append(freesound_record(sound))
        if sounds:
            return sounds
    return []


def freesound_spell_casts(api_key):
    # A live refresh is cached beside the downloaded catalog. It must not replace index.json:
    # that file keeps the page, author, hash, and local preview name for clips already saved.
    sounds = []
    page = 1
    try:
        while True:
            url = "https://freesound.org/apiv2/search/?" + urllib.parse.urlencode({
                "query": FREESOUND_SEARCH["query"], "filter": FREESOUND_SEARCH["filter"],
                "page": str(page), "page_size": "150", "sort": "score",
                "fields": "id,name,username,license,duration,previews",
            })
            request = urllib.request.Request(url, headers={"Authorization": "Token " + api_key})
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read())
            for sound in payload.get("results", []):
                record = freesound_record(sound)
                if record["preview_url"] and "creativecommons.org/publicdomain/zero" in record["license"]:
                    sounds.append(record)
            if not payload.get("next"):
                break
            page += 1
        if sounds:
            save_json(WORK / "freesound" / "cc0-spell-cast" / "search.json", {"sounds": sounds})
            return sounds
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, KeyError, ValueError):
        pass
    saved = saved_freesound_spell_casts()
    if saved:
        return saved
    raise ValueError("Freesound search failed and there is no saved CC0 spell-cast page")


def download_freesound_preview(sound):
    folder = WORK / "freesound" / "cc0-spell-cast"
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    if sound.get("preview"):
        names.append(sound["preview"])
    url = str(sound.get("preview_url") or "")
    names.append(str(sound["id"]) + (".ogg" if url.endswith(".ogg") or not url else ".mp3"))
    if not url.endswith(".ogg"):
        names.append(str(sound["id"]) + ".ogg")
    safe_names = [name for name in dict.fromkeys(names) if name and Path(name).name == name]
    if not safe_names:
        raise ValueError("Freesound preview name must stay inside the local cache")
    for name in safe_names:
        local = (folder / name).resolve()
        if not local.is_relative_to(folder.resolve()) or not local.is_file() or local.stat().st_size <= 500:
            continue
        return local
    if not url:
        raise ValueError("Missing Freesound preview for " + str(sound.get("id")))
    destination = folder / (str(sound["id"]) + (".ogg" if url.endswith(".ogg") else ".mp3"))
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = response.read(2_000_001)
    if not 500 < len(payload) <= 2_000_000:
        raise ValueError("Unexpected Freesound preview size")
    temporary = destination.with_suffix(".download")
    temporary.write_bytes(payload)
    temporary.replace(destination)
    return destination


def claim_next_freesound(api_key):
    # Mark the clip used before mastering. A file that fails the loudness or duration check
    # is not offered again on the next click.
    cursor_path = WORK / "freesound-spell-cursor.json"
    cursor = json.loads(cursor_path.read_text()) if cursor_path.exists() else {"used": []}
    used = set()
    for item in cursor.get("used", []):
        try:
            used.add(int(item))
        except (TypeError, ValueError):
            continue
    for sound in freesound_spell_casts(api_key):
        if sound["id"] in used:
            continue
        used.add(sound["id"])
        save_json(cursor_path, {"used": sorted(used)})
        return sound
    raise ValueError("Every CC0 spell-cast result has already been tried")


def prepare_candidate(job, index, path, source):
    unit, _ = design_entry(job["slug"], job["role"])
    key = job["slug"] + "/" + job["role"]
    folder = JOBS / job["id"] / str(index)
    source_id = source.get("source_id") or "source-" + hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    if job.get("provider") in ("suno", "elevenlabs"):
        source = {**source, "duration_limit_ms": min(1600, round(job["duration_seconds"] * 1000))}
    if job.get("provider") == "suno":
        source["crop_to_duration"] = True
    record = {"path": path, "unit": unit["name"], "slug": unit["slug"], "role": job["role"],
              "source_id": source_id, "source": source}
    result = master(key, [record], folder, folder / "assets")
    source = result.get("source", source)
    return {"index": index, "label": source.get("label", "Take " + str(index + 1)),
            "source_id": source_id, "source": source, "path": str(path.relative_to(CORE)),
            "asset_base": str((folder / "assets" / key.replace("/", "_")).relative_to(CORE)), "result": result}


def prepare_spell_candidate(job, index, path, source):
    spell = next((row for row in spell_placeholders() if row["slug"] == job["slug"]), None)
    if spell is None:
        raise ValueError("Unknown spell")
    key = job["slug"] + "/cast"
    folder = JOBS / job["id"] / str(index)
    source_id = source.get("source_id") or "freesound-" + str(source.get("freesound_id"))
    record = {"path": path, "unit": spell["unit"], "slug": spell["slug"], "role": "cast",
              "source_id": source_id, "source": source}
    result = master(key, [record], folder, folder / "assets", SPELL_MAX_DURATION_MS)
    result["school"] = spell["school"]
    result["level"] = spell["level"]
    result["target_label"] = spell["target_label"]
    result["summary"] = spell["summary"]
    return {"index": index, "label": source.get("label", "Freesound " + str(source.get("freesound_id"))),
            "source_id": source_id, "source": source, "path": str(path.relative_to(CORE)),
            "asset_base": str((folder / "assets" / key.replace("/", "_")).relative_to(CORE)), "result": result}


def apply_spell_candidate(job, index):
    candidate = next((c for c in job["candidates"] if c["index"] == index), None)
    if not candidate:
        raise ValueError("Take not found or not mastered successfully")
    slug = job["slug"]
    base = CORE / "public/audio/spells" / slug
    base.parent.mkdir(parents=True, exist_ok=True)
    staged_files = {codec: CORE / (candidate["asset_base"] + "." + codec) for codec in ("webm", "mp3")}
    if not all(path.is_file() for path in staged_files.values()):
        raise ValueError("Restore both mastered candidate files before applying")
    combat = load_combat_report()["clips"]
    for codec in ("webm", "mp3"):
        shutil.copyfile(staged_files[codec], base.with_suffix("." + codec))
    revision = hashlib.sha256(base.with_suffix(".webm").read_bytes() + base.with_suffix(".mp3").read_bytes()).hexdigest()[:10]
    result = dict(candidate["result"])
    result["asset_base"] = str(base.relative_to(CORE))
    result["revision"] = revision
    result["source_id"] = candidate["source_id"]
    result["source"] = candidate["source"]
    report_path = WORK / "spell-sound-report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {"clips": []}
    report["clips"] = [result if clip.get("slug") == slug else clip for clip in report["clips"]]
    if not any(clip.get("slug") == slug for clip in report["clips"]):
        report["clips"].append(result)
    save_json(report_path, report)
    write_review(WORK, combat)
    job["applied_index"] = index
    save_json(JOBS / job["id"] / "job.json", job)
    return {"revision": revision, "slug": slug, "role": "cast"}


def apply_candidate(job, index):
    if job.get("role") == "cast":
        return apply_spell_candidate(job, index)
    candidate = next((c for c in job["candidates"] if c["index"] == index), None)
    if not candidate:
        raise ValueError("Take not found or not mastered successfully")
    slug, role = job["slug"], job["role"]
    key = slug + "/" + role
    base = CORE / "public/audio/combat" / key.replace("/", "_")
    staged_files = {codec: CORE / (candidate["asset_base"] + "." + codec) for codec in ("webm", "mp3")}
    if not all(path.is_file() for path in staged_files.values()):
        raise ValueError("Restore both mastered candidate files before applying")
    report = load_combat_report()
    for codec in ("webm", "mp3"):
        shutil.copyfile(staged_files[codec], base.with_suffix("." + codec))
    result = candidate["result"]
    revision = hashlib.sha256(base.with_suffix(".webm").read_bytes() + base.with_suffix(".mp3").read_bytes()).hexdigest()[:10]
    overrides_path = CORE / "audio/combat-sound-overrides.json"
    overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    overrides[key] = {k: candidate[k] for k in ("source_id", "path", "source")}
    save_json(overrides_path, overrides, 4)
    source = candidate["source"]
    if source.get("kind") in ("elevenlabs-api", "elevenlabs-mcp", "suno-mcp") and source.get("prompt"):
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
                              in ("library", "user-provided", "suno-mcp") for c in provenance["clips"]) else "ElevenLabs")
    save_json(provenance_path, provenance, 4)
    report_path = WORK / "mastering-report.json"
    report["clips"] = [result if c["slug"] == slug and c["role"] == role else c for c in report["clips"]]
    write_review(WORK, report["clips"])
    save_json(report_path, report)
    job["applied_index"] = index
    save_json(JOBS / job["id"] / "job.json", job)
    return {"revision": revision, "slug": slug, "role": role}


class ReviewService:
    def __init__(self, api_key=None, suno=None):
        self.api_key = api_key if api_key is not None else os.environ.get("ELEVENLABS_API_KEY", "")
        self.suno = suno if suno is not None else SunoMcp(CORE.parents[1])
        self.suno_status = None
        self.suno_status_time = 0
        self.suno_status_lock = threading.Lock()
        self.lock = threading.Lock()
        self.active = None
        self.jobs = {}
        for path in JOBS.glob("*/job.json"):
            job = json.loads(path.read_text())
            if job.get("provider") == "suno":
                # Older jobs labeled an explicit download-quota refusal as an
                # uncertain paid request. Recover those clips without regenerating.
                repaired = False
                for clip in job.get("suno_clips", []):
                    for error in job.get("errors", []):
                        if (clip["state"] == "download_uncertain" and error.get("index") == clip["index"]
                                and "Suno returned insufficient_credits;" in error.get("message", "")):
                            clip["state"] = "download_blocked"
                            error.update({"stage": "download", "code": "insufficient_credits", "reason": "quota_exhausted",
                                          "message": str(SunoToolError("audio-download", "insufficient_credits"))})
                            repaired = True
                if repaired:
                    job["status"] = suno_job_status(job)
                    save_json(path, job)
            # A process restart cannot safely retry an ambiguous charged request.
            if job["status"] == "generating":
                if job.get("provider") == "suno":
                    for clip in job.get("suno_clips", []):
                        if clip["state"] == "download_requested":
                            clip["state"] = "download_uncertain"
                            job["errors"].append({"index": clip["index"],
                                                  "message": "A confirmed download was interrupted; check it in Suno before retrying."})
                    job["status"] = suno_job_status(job)
                else:
                    job["status"] = "ready" if job.get("candidates") else "interrupted"
                save_json(path, job)
            self.jobs[job["id"]] = job

    def providers(self):
        return {
            "elevenlabs": {"label": "ElevenLabs", "takes": 4, "max_prompt_length": 1000,
                           "available": bool(self.api_key),
                           "note": "Four fresh takes using ElevenLabs credits, with the sound's configured duration.",
                           "error": "Configure ELEVENLABS_API_KEY in the review server environment."},
            "suno": {"label": "Suno", "takes": 2, "max_prompt_length": 400,
                     "available": None, "note": "Long Suno takes are cut to one short event with a smooth fade before audition. "
                     "Two takes use 2 generation credits; downloads may also use 1 download credit per take.",
                     "error": "Checking the Suno connection…"},
        }

    def check_suno(self, force=False):
        with self.suno_status_lock:
            if force or self.suno_status is None or time.monotonic() - self.suno_status_time > 60:
                status = {"available": False, "connected": False, "label": "Suno",
                          "generation_credits": None, "download_credits": None, "error": ""}
                try:
                    usage = self.suno.call("account-usage", {})
                    account = usage.get("suno_account") or {}
                    if not account:
                        raise ValueError("Sign in to Suno with codex mcp login suno; an API key cannot create Sounds.")
                    status.update({"connected": True, "generation_credits": account.get("credits_remaining"),
                                   "download_credits": account.get("download_credits_remaining")})
                    plan = account.get("plan") or {}
                    plan_name = plan.get("name", "") if isinstance(plan, dict) else str(plan)
                    if any(name in plan_name.lower() for name in ("free", "basic")):
                        raise ValueError("Suno Sounds requires a Pro or Premier plan.")
                    if account.get("credits_remaining", 0) < 2:
                        raise ValueError("Suno needs at least 2 generation credits for these two takes.")
                    if "audio.download" not in usage.get("features", []):
                        raise ValueError("This Suno plan does not allow downloading the generated sounds.")
                    if not isinstance(status["download_credits"], (int, float)) or status["download_credits"] < 2:
                        raise ValueError("Suno is connected, but this page requires 2 available download credits before creating "
                                         "another batch. Generation credits cannot pay for downloads. Choose ElevenLabs or add download credits in Suno.")
                    status["available"] = True
                except Exception as error:
                    status["error"] = str(error)[:500]
                self.suno_status = status
                self.suno_status_time = time.monotonic()
            return dict(self.suno_status)

    def regenerate(self, slug, role, prompt, request_id, mode="fresh", provider="elevenlabs"):
        if mode == "similar":
            raise ValueError(SIMILAR_UNAVAILABLE)
        if mode != "fresh":
            raise ValueError("Unknown regeneration mode")
        if role == "cast":
            return self.regenerate_spell(slug, request_id)
        if provider not in ("elevenlabs", "suno"):
            raise ValueError("Unknown sound provider")
        unit, defaults = design_entry(slug, role)
        maximum = self.providers()[provider]["max_prompt_length"]
        if not isinstance(prompt, str) or not 5 <= len(prompt.strip()) <= maximum:
            raise ValueError(f"Use a sound description between 5 and {maximum} characters for {provider}")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{16,64}", request_id):
            raise ValueError("Invalid generation request ID")
        with self.lock:
            if request_id in self.jobs:
                existing = self.jobs[request_id]
                if (existing["slug"], existing["role"], existing["prompt"]) != (slug, role, prompt.strip()):
                    raise ValueError("This request ID belongs to another generation")
                if existing.get("provider", "elevenlabs") != provider:
                    raise ValueError("This request ID belongs to another sound provider")
                return existing  # An ambiguous browser retry never starts another paid run.
            if provider == "elevenlabs" and not self.api_key:
                raise ValueError("Set ELEVENLABS_API_KEY in the local server environment")
            if self.active:
                raise ValueError("A generation is already running; wait for its existing takes")
            job = {"id": request_id, "slug": slug, "role": role, "unit": unit["name"],
                   "prompt": prompt.strip(), "status": "generating", "candidates": [], "errors": [],
                   "duration_seconds": defaults["duration_seconds"],
                   "provider": provider, "take_count": self.providers()[provider]["takes"],
                   "mode": mode,
                   "created_at": datetime.now(timezone.utc).isoformat()}
            if provider == "suno":
                job["provider_prompt"] = (f"Single {defaults['duration_seconds']:g}-second one-shot, played once. " + prompt.strip() +
                                          " End immediately; no repeats or long tail.")
            else:
                job["prompt_influence"] = 0.3
            self.jobs[request_id] = job
            self.active = request_id
            save_json(JOBS / request_id / "job.json", job)
            target = self.generate_suno if provider == "suno" else self.generate
            threading.Thread(target=target, args=(job,), daemon=True).start()
            return job

    def save_job(self, job):
        with self.lock:
            save_json(JOBS / job["id"] / "job.json", job)

    def suno_candidate(self, job, item):
        index, clip_id = item["index"], item["clip_id"]
        approved = item.get("state") == "download_approved"
        if approved:
            # Persist before spending a download credit. An ambiguous response must
            # never cause an automatic second confirmed download.
            item["state"] = "download_requested"
            self.save_job(job)
        download = self.suno.call("audio-download", {"id": clip_id, "format": "mp3", "confirm": approved})
        if download.get("status") == "requires_credit":
            balance = self.check_suno(force=True)
            item["state"] = "requires_credit" if (balance.get("download_credits") or 0) >= 1 else "download_blocked"
            return
        if download.get("status") == "processing":
            if approved:
                raise RuntimeError("Suno is still preparing an approved download; check it in Suno before retrying.")
            return
        url = download.get("url", "")
        if download.get("status") != "ok" or urllib.parse.urlparse(url).scheme != "https":
            raise ValueError("Suno did not return a finished download")
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                audio = response.read(5_000_001)
        except Exception:
            # Do not persist exceptions that could contain the signed download URL.
            raise RuntimeError("Suno audio download failed. The generated clip remains in your Suno library.") from None
        if not 500 < len(audio) <= 5_000_000:
            raise ValueError("Unexpected Suno sound file size")
        path = JOBS / job["id"] / "raw" / (str(index) + ".mp3")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(audio)
        source = {"kind": "suno-mcp", "tool": "sounds-create", "clip_id": clip_id,
                  "source_id": "suno-" + clip_id, "prompt": job["prompt"],
                  "request_prompt": job["provider_prompt"], "sha256": hashlib.sha256(audio).hexdigest(),
                  "label": "Suno take " + str(index + 1)}
        candidate = prepare_candidate(job, index, path, source)
        with self.lock:
            job["candidates"].append(candidate)
            job["candidates"].sort(key=lambda c: c["index"])
            item["state"] = "ready"

    def generate_suno(self, job):
        try:
            if not job.get("suno_clips"):
                if not job.get("creation_sent"):
                    status = self.check_suno(force=True)
                    if not status["available"]:
                        raise ValueError(status["error"])
                job["creation_sent"] = True
                self.save_job(job)
                created = self.suno.call("sounds-create", {
                    "description": job["provider_prompt"], "loop": False,
                    "title": job["unit"] + " " + job["role"], "idempotency_key": job["id"],
                })
                ids = created.get("clip_ids")
                if not isinstance(ids, list) or not 1 <= len(ids) <= 2 or any(not isinstance(i, str) or not i for i in ids):
                    raise ValueError("Suno returned no usable clip IDs. Resume this batch to recover the same request.")
                job["suno_clips"] = [{"clip_id": clip_id, "index": i, "state": "pending"}
                                     for i, clip_id in enumerate(dict.fromkeys(ids))]
                job["take_count"] = len(job["suno_clips"])
                self.suno_status_time = 0
                self.save_job(job)
            deadline = time.monotonic() + 600
            while time.monotonic() < deadline:
                pending = [c for c in job["suno_clips"] if c["state"] in ("pending", "download_approved")]
                if not pending:
                    break
                for item in pending:
                    try:
                        clip = self.suno.call("audio-retrieve", {"id": item["clip_id"]})
                        duration = (clip.get("metadata") or {}).get("duration")
                        if isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0:
                            item["raw_duration_ms"] = round(duration * 1000)
                        url = clip.get("song_url", "")
                        parsed = urllib.parse.urlparse(url)
                        if parsed.scheme == "https" and parsed.netloc == "suno.com" and parsed.path.startswith("/song/"):
                            item["song_url"] = urllib.parse.urlunparse(("https", "suno.com", parsed.path, "", "", ""))
                        if clip.get("status") == "error":
                            raise ValueError("Suno could not generate this take")
                        if clip.get("status") == "complete":
                            self.suno_candidate(job, item)
                    except Exception as error:
                        if isinstance(error, SunoToolError) and error.tool == "audio-download" and error.code == "insufficient_credits":
                            item["state"] = "download_blocked"
                            self.suno_status_time = 0
                        elif item["state"] == "download_requested":
                            item["state"] = "download_uncertain"
                        elif isinstance(error, ValueError):
                            item["state"] = "failed"
                        else:
                            # Connection failures preserve known clip IDs for an explicit
                            # resume; only polling/downloads repeat, never creation.
                            self.save_job(job)
                            raise
                        entry = {"index": item["index"], "message": str(error)[:500]}
                        if isinstance(error, SunoToolError):
                            entry.update({"stage": "download", "code": error.code, "reason": error.reason})
                        job["errors"].append(entry)
                    self.save_job(job)
                if any(c["state"] in ("pending", "download_approved") for c in job["suno_clips"]):
                    time.sleep(3)
        except Exception as error:
            if isinstance(error, SunoToolError) and error.tool == "sounds-create" and error.code == "insufficient_credits":
                job["creation_sent"] = False  # This is a definite refusal, not a lost response.
                self.suno_status_time = 0
            job["errors"].append({"index": -1, "message": str(error)[:500]})
        finally:
            with self.lock:
                job["status"] = suno_job_status(job)
                self.active = None
                save_json(JOBS / job["id"] / "job.json", job)

    def resume_suno(self, job_id, download_index=None):
        if download_index is not None:
            balance = self.check_suno(force=True)
            if (balance.get("download_credits") or 0) < 1:
                raise ValueError("Suno has no download credits available. This take is saved in Suno; generation credits are separate.")
        with self.lock:
            job = self.jobs.get(job_id)
            if not job or job.get("provider") != "suno":
                raise ValueError("Unknown Suno batch")
            if self.active or job["status"] == "generating":
                raise ValueError("Wait for the current generation to finish")
            if download_index is not None:
                item = next((c for c in job.get("suno_clips", []) if c["index"] == download_index), None)
                if type(download_index) is not int or not item or item["state"] != "requires_credit":
                    raise ValueError("This take is not waiting for download-credit approval")
                item["state"] = "download_approved"
            elif job["status"] not in ("interrupted", "download_blocked"):
                raise ValueError("This batch has no interrupted generation to resume")
            if download_index is None:
                for item in job.get("suno_clips", []):
                    if item["state"] == "download_blocked":
                        item["state"] = "pending"  # Probe without confirmation; never spend a download credit here.
            if not job.get("suno_clips"):
                age = datetime.now(timezone.utc) - datetime.fromisoformat(job["created_at"])
                if age.total_seconds() > 23 * 3600:
                    raise ValueError("This request is too old to safely replay. Recover its sounds from the Suno library.")
            job["status"] = "generating"
            self.active = job_id
            save_json(JOBS / job_id / "job.json", job)
            threading.Thread(target=self.generate_suno, args=(job,), daemon=True).start()
            return job

    def regenerate_spell(self, slug, request_id):
        spell = next((row for row in spell_placeholders() if row["slug"] == slug), None)
        if spell is None:
            raise ValueError("Unknown spell")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9-]{16,64}", request_id):
            raise ValueError("Invalid generation request ID")
        with self.lock:
            if request_id in self.jobs:
                return self.jobs[request_id]
            if not freesound_api_key():
                raise ValueError("Save the Freesound API key before requesting the next sound")
            if self.active:
                raise ValueError("A sound is already being prepared; wait for it to finish")
            job = {"id": request_id, "slug": slug, "role": "cast", "unit": spell["unit"],
                   "prompt": spell["unit"] + " · next CC0 Freesound spell cast",
                   "status": "generating", "candidates": [], "errors": [],
                   "created_at": datetime.now(timezone.utc).isoformat()}
            self.jobs[request_id] = job
            self.active = request_id
            save_json(JOBS / request_id / "job.json", job)
            threading.Thread(target=self.generate_spell, args=(job,), daemon=True).start()
            return job

    def generate_spell(self, job):
        try:
            api_key = freesound_api_key()
            for attempt in range(8):
                try:
                    sound = claim_next_freesound(api_key)
                except ValueError as error:
                    with self.lock:
                        job["errors"].append({"index": attempt, "message": str(error)[:500]})
                    break
                try:
                    path = download_freesound_preview(sound)
                    source = {"kind": "freesound", "license": sound["license"], "author": sound["username"],
                              "filename": sound["name"], "freesound_id": sound["id"], "page": sound["page"],
                              "page_url": sound["page"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                              "label": sound["name"]}
                    candidate = prepare_spell_candidate(job, len(job["candidates"]), path, source)
                except (ValueError, urllib.error.URLError, TimeoutError, OSError) as error:
                    with self.lock:
                        job["errors"].append({"index": attempt, "message": sound["name"] + ": " + str(error)[:500]})
                        save_json(JOBS / job["id"] / "job.json", job)
                    continue
                with self.lock:
                    job["candidates"].append(candidate)
                    job["prompt"] = sound["name"]
                    save_json(JOBS / job["id"] / "job.json", job)
                break
        finally:
            with self.lock:
                job["status"] = "ready" if job["candidates"] else "failed"
                self.active = None
                save_json(JOBS / job["id"] / "job.json", job)

    def take(self, job, index):
        payload = {"text": job["prompt"], "duration_seconds": job["duration_seconds"],
                   "prompt_influence": job.get("prompt_influence", 0.7),
                   "loop": False, "model_id": "eleven_text_to_sound_v2"}
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
                  "prompt_influence": payload["prompt_influence"],
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
            try:
                report = load_combat_report()
            except (OSError, ValueError):
                return self.json_response(503, {"error": "Audio review data is unavailable. Restore tmp/audio/review.html "
                                               "or tmp/audio/mastering-report.json, then reopen this dialog."})
            nodes_file = WORK / "nodes.json"
            flow_id = json.loads(nodes_file.read_text()).get("flow_id") if nodes_file.exists() else None
            combat = [clip for clip in report["clips"] if clip.get("role") != "cast"]
            return self.json_response(200, {"sounds": combat + spell_rows_for_review(WORK),
                                      "can_generate": bool(service.api_key),
                                      "providers": service.providers(),
                                      "regeneration": {"fresh": True, "similar": False,
                                                       "similar_unavailable": SIMILAR_UNAVAILABLE},
                                      "freesound": bool(freesound_api_key()),
                                      "provider_url": "https://elevenlabs.io/app/flows/" + flow_id if flow_id else None})
        if parsed.path == "/api/audio/provider/suno":
            return self.json_response(200, service.check_suno())
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
                job = service.regenerate(body.get("slug"), body.get("role"), body.get("prompt"), body.get("request_id"),
                                         body.get("mode", "fresh"), body.get("provider", "elevenlabs"))
                return self.json_response(202, {"id": job["id"], "status": job["status"]})
            if self.path == "/api/audio/resume":
                job = service.resume_suno(body.get("job_id"), body.get("download_index"))
                return self.json_response(202, {"id": job["id"], "status": job["status"]})
            if self.path == "/api/audio/apply":
                with service.lock:
                    job = service.jobs.get(body.get("job_id"))
                    if not job or job["status"] not in ("ready", "failed", "interrupted", "needs_download_approval", "download_blocked"):
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
    print("ElevenLabs generation available: " + str(bool(server.service.api_key)), flush=True)
    print("Suno generation uses the signed-in Codex MCP connection; readiness is checked in the review page.", flush=True)
    print("Freesound spell search available: " + str(bool(freesound_api_key())), flush=True)
    def stop(*args):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        server.service.suno.close()


if __name__ == "__main__":
    main()
