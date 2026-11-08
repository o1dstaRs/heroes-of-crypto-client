import hashlib
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
import shutil
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

import serve_audio_review as review
import prepare_combat_audio as mastering

REAL_CORE = review.CORE


class FakeSuno:
    def __init__(self):
        self.calls = []
        self.needs_credit = set()
        self.create_timeout = False
        self.retrieve_timeout = False
        self.download_timeout = False
        self.download_credits = 20
        self.generation_credits = 20
        self.features = ["audio.download"]
        self.reject_download = False
        self.reject_generation = False

    def call(self, name, arguments):
        self.calls.append((name, dict(arguments)))
        if name == "account-usage":
            return {"features": self.features, "suno_account": {
                "credits_remaining": self.generation_credits, "download_credits_remaining": self.download_credits,
                "plan": {"name": "Pro Plan"}}}
        if name == "sounds-create":
            if self.reject_generation:
                raise review.SunoToolError(name, "insufficient_credits")
            if self.create_timeout:
                self.create_timeout = False
                raise TimeoutError("Creation response was lost")
            return {"clip_ids": ["clip-a", "clip-b"]}
        if name == "audio-retrieve":
            if self.retrieve_timeout:
                self.retrieve_timeout = False
                raise TimeoutError("Polling response was lost")
            return {"id": arguments["id"], "status": "complete", "song_url": "https://suno.com/song/" + arguments["id"],
                    "metadata": {"duration": 0.35}}
        if name == "audio-download":
            if arguments["id"] in self.needs_credit and not arguments["confirm"]:
                return {"status": "requires_credit"}
            if arguments["confirm"] and self.download_timeout:
                raise TimeoutError("Confirmed download response was lost")
            if arguments["confirm"] and self.reject_download:
                self.download_credits = 0
                raise review.SunoToolError(name, "insufficient_credits", "quota_exhausted")
            return {"status": "ok", "url": "https://audio.example/take.mp3?secret=signed-test-token"}
        raise AssertionError("Unexpected Suno tool: " + name)


class AudioReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=REAL_CORE / "tmp/audio")
        self.root = Path(self.directory.name)
        self.work = self.root / "tmp/audio"
        self.jobs = self.work / "revisions"
        (self.root / "audio").mkdir()
        shutil.copyfile(REAL_CORE / "audio/combat-sound-design.json", self.root / "audio/combat-sound-design.json")
        shutil.copyfile(REAL_CORE / "audio/combat-sound-review.html", self.root / "audio/combat-sound-review.html")
        self.patches = [patch.object(review, "CORE", self.root), patch.object(review, "WORK", self.work),
                        patch.object(review, "JOBS", self.jobs), patch.object(mastering, "CORE", self.root)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.directory.cleanup()

    def test_duplicate_requests_start_one_job_and_cross_origin_requests_cannot_generate(self):
        service = review.ReviewService(api_key="test-private-key-never-sent-to-browser")
        started = threading.Event()
        calls = []
        def generate(job):
            calls.append(job["id"])
            started.set()
        service.generate_fresh = generate
        server = ThreadingHTTPServer(("127.0.0.1", 0), review.ReviewHandler)
        server.service = service
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        body = {"slug": "abomination", "role": "attack", "prompt": "One short dry monster grunt",
                "request_id": "request-0000000000000001"}
        def send(source):
            request = urllib.request.Request(origin + "/api/audio/regenerate", data=json.dumps(body).encode(),
                      headers={"Content-Type": "application/json", "Origin": source})
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read())
        try:
            with self.assertRaises(urllib.error.HTTPError) as rejected:
                send("https://unrelated.example")
            self.assertEqual(rejected.exception.code, 403)
            rejected.exception.close()
            self.assertEqual(calls, [])
            first = send(origin)
            self.assertTrue(started.wait(1))
            second = send(origin)
            self.assertEqual(first["id"], second["id"])
            self.assertEqual(len(calls), 1)
            self.assertNotIn(service.api_key, json.dumps(first))
            self.assertNotIn(service.api_key, (self.jobs / first["id"] / "job.json").read_text())
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def fixture(self, missing_mp3=False):
        unit = {"unit": "Abomination", "slug": "abomination"}
        attack = {**unit, "role": "attack", "generation_id": "old-attack", "encoded": {}}
        hurt = {**unit, "role": "hurt", "generation_id": "keep-hurt", "encoded": {}}
        manifest = {"Abomination": {"slug": "abomination", "attack": {"durationMs": 100, "revision": "old"},
                                   "hurt": {"durationMs": 200, "revision": "keep"}}}
        review.save_json(self.root / "src/ui/audio/combatSoundManifest.json", manifest)
        review.save_json(self.root / "audio/combat-sound-provenance.json", {"clips": [attack, hurt]})
        review.save_json(self.work / "mastering-report.json", {"clips": [attack, hurt]})
        assets = self.root / "public/audio/combat"
        assets.mkdir(parents=True)
        for ext in ("webm", "mp3"):
            (assets / ("abomination_attack." + ext)).write_bytes(b"previous attack")
            (assets / ("abomination_hurt." + ext)).write_bytes(b"keep hurt")
        staged = self.jobs / "test-job/0/assets"
        staged.mkdir(parents=True)
        (staged / "abomination_attack.webm").write_bytes(b"mastered opus")
        if not missing_mp3:
            (staged / "abomination_attack.mp3").write_bytes(b"mastered mp3")
        result = {**unit, "role": "attack", "source_id": "selected-file", "source": {"kind": "user-provided"},
                  "encoded": {"webm": {"duration_ms": 350}}}
        candidate = {"index": 0, "source_id": "selected-file", "source": result["source"],
                     "path": "tmp/audio/raw/selected.wav", "result": result,
                     "asset_base": str((staged / "abomination_attack").relative_to(self.root))}
        job = {"id": "test-job", "slug": "abomination", "role": "attack", "candidates": [candidate]}
        return assets, job

    def test_context_and_art_routes_only_serve_the_selected_creatures_references(self):
        artwork = self.root / "current-creature.webp"
        artwork.write_bytes(b"current-artwork")
        context = {"images": [{"kind": "full_body", "key": "current_creature"}],
                   "creature": {"name": "Abomination", "abilities": []}}
        server = ThreadingHTTPServer(("127.0.0.1", 0), review.ReviewHandler)
        server.service = review.ReviewService(api_key="")
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        try:
            with patch.object(review, "sound_context", return_value=(context, [artwork])) as load:
                with urllib.request.urlopen(origin + "/api/audio/context?slug=abomination&role=attack") as response:
                    self.assertEqual(json.loads(response.read()), context)
                load.assert_called_with(self.root, "abomination", "attack")
                with urllib.request.urlopen(origin + "/api/audio/art/abomination/attack/current_creature") as response:
                    self.assertEqual(response.headers.get_content_type(), "image/webp")
                    self.assertEqual(response.read(), b"current-artwork")
                with self.assertRaises(urllib.error.HTTPError) as rejected:
                    urllib.request.urlopen(origin + "/api/audio/art/abomination/attack/private_file")
                self.assertEqual(rejected.exception.code, 404)
                rejected.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_fresh_regeneration_sends_description_with_more_variation_and_records_actual_settings(self):
        service = review.ReviewService(api_key="test-key")
        prompt = "One short dry spider pain squeak"
        with patch.object(review.threading.Thread, "start"):
            job = service.regenerate("arachna-spider", "hurt", prompt, "fresh-request-00000001")
        requests = []

        class Response:
            headers = {"request-id": "provider-request"}

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, limit):
                return b"generated-audio" * 100

        def send(request, **kwargs):
            requests.append(json.loads(request.data))
            return Response()

        def candidate(job, index, path, source):
            self.assertTrue(path.is_file())
            return {"index": index, "source": source}

        with patch.object(review.urllib.request, "urlopen", side_effect=send), \
             patch.object(review, "prepare_candidate", side_effect=candidate):
            result = service.take(job, 0)
        self.assertEqual(len(requests), 1)
        payload = requests[0]
        self.assertEqual(payload["text"], prompt)
        self.assertEqual(payload["prompt_influence"], 0.3)
        self.assertFalse(payload["loop"])
        self.assertEqual(set(payload), {"text", "duration_seconds", "prompt_influence", "loop", "model_id"})
        self.assertEqual(result["source"]["prompt"], payload["text"])
        self.assertEqual(result["source"]["prompt_influence"], payload["prompt_influence"])
        self.assertNotIn("test-key", json.dumps(result))
        saved = json.loads((self.jobs / job["id"] / "job.json").read_text())
        self.assertEqual(saved["mode"], "fresh")
        self.assertEqual(saved["prompt_influence"], 0.3)

    def test_regenerate_rethinks_with_context_feedback_and_history_before_either_audio_provider(self):
        from unittest.mock import Mock
        previous = "One short dry monster grunt"
        context = {"authored_prompt": previous, "creature": {"name": "Abomination", "abilities": []}, "images": []}
        direction = {"prompt": "One close constricted chest bark: abrupt coarse low pressure snap, gravelly throat body and a clipped breath ending. No words, music, ambience or reverb.",
                     "concept": "Chest bark", "visual_basis": "A massive brute with a heavy chest.",
                     "reason": "Fits its weight.", "changes": "A clipped bark replaces the drawn grunt."}
        for provider in ("elevenlabs", "suno"):
            with self.subTest(provider=provider):
                if provider == "suno":
                    direction = {**direction,
                        "prompt": "An abrupt wet nasal crack followed by a low sealed-mouth rumble and a clipped throat click. Close and dry, one half-second undead exertion, no words, music, ambience, reverb or impact.",
                        "concept": "Nasal crack", "changes": "A nasal crack replaces the chest bark and prior drawn grunt."}
                director = Mock()
                director.rewrite.return_value = dict(direction)
                service = review.ReviewService(api_key="test-key", director=director)
                old_id = "older-" + provider
                service.jobs[old_id] = {"id": old_id, "slug": "abomination", "role": "attack",
                    "prompt": "Earlier rejected snorting rattle", "created_at": "2026-01-01", "direction": {"concept": "Rattle"}}
                request_id = "new-direction-request-" + provider
                with patch.object(review.threading.Thread, "start"):
                    job = service.regenerate("abomination", "attack", previous, request_id,
                        provider=provider, feedback="Less breath, more weight")
                with patch.object(review, "sound_context", return_value=(context, [Path("current-creature.webp")])), \
                     patch.object(service, "generate") as elevenlabs, patch.object(service, "generate_suno") as suno:
                    service.generate_fresh(job)
                director.rewrite.assert_called_once()
                args = director.rewrite.call_args.args
                self.assertEqual(args[:3], (context, [Path("current-creature.webp")], previous))
                self.assertIn({"prompt": "Earlier rejected snorting rattle", "concept": "Rattle"}, args[3])
                self.assertEqual(args[4], "Less breath, more weight")
                (suno if provider == "suno" else elevenlabs).assert_called_once_with(job)
                (elevenlabs if provider == "suno" else suno).assert_not_called()
                self.assertEqual(job["prompt"], direction["prompt"])
                self.assertEqual(job["rejected_prompt"], previous)
                self.assertEqual(job["stage"], "creating")
                self.assertEqual(job["direction_context"], context)
                if provider == "suno":
                    self.assertIn(direction["prompt"], job["provider_prompt"])
                    self.assertLessEqual(len(job["provider_prompt"]), 400)
                saved = json.loads((self.jobs / job["id"] / "job.json").read_text())
                self.assertEqual(saved["direction"], direction)
                with patch.object(review.threading.Thread, "start") as start:
                    duplicate = service.regenerate("abomination", "attack", previous, request_id,
                        provider=provider, feedback="Less breath, more weight")
                self.assertIs(duplicate, job)
                start.assert_not_called()
                director.rewrite.assert_called_once()

    def test_failed_or_repeated_direction_never_submits_audio_generation(self):
        from unittest.mock import Mock
        previous = "One short dry monster grunt"
        context = {"authored_prompt": previous, "images": []}
        for failure in ("model-error", "repeated-prompt", "missing-art"):
            with self.subTest(failure=failure):
                director = Mock()
                director.rewrite.return_value = {"prompt": previous, "concept": "Same", "visual_basis": "Brute",
                    "reason": "Same", "changes": "Same"}
                if failure == "model-error":
                    director.rewrite.side_effect = RuntimeError("Sound director unavailable")
                service = review.ReviewService(api_key="test-key", director=director)
                with patch.object(review.threading.Thread, "start"):
                    job = service.regenerate("abomination", "attack", previous, "failure-request-" + failure)
                with patch.object(review, "sound_context", return_value=(context, []),
                                  side_effect=ValueError("Missing current artwork") if failure == "missing-art" else None), \
                     patch.object(service, "generate") as elevenlabs, patch.object(service, "generate_suno") as suno:
                    service.generate_fresh(job)
                elevenlabs.assert_not_called()
                suno.assert_not_called()
                self.assertEqual(job["status"], "failed")
                self.assertIsNone(service.active)
                self.assertEqual(job["errors"][-1]["stage"], "directing")
                if failure == "missing-art":
                    director.rewrite.assert_not_called()

    def test_similar_generation_cannot_silently_charge_for_a_text_only_run(self):
        service = review.ReviewService(api_key="test-key")
        with patch.object(review.threading.Thread, "start") as start:
            with self.assertRaisesRegex(ValueError, "Reference-audio regeneration"):
                service.regenerate("arachna-spider", "hurt", "One spider squeak",
                                   "similar-request-000001", mode="similar")
            with self.assertRaisesRegex(ValueError, "Unknown regeneration mode"):
                service.regenerate("arachna-spider", "hurt", "One spider squeak",
                                   "unknown-request-000001", mode="other")
        start.assert_not_called()
        self.assertEqual(service.jobs, {})
        self.assertIsNone(service.active)

    def suno_job(self, client):
        service = review.ReviewService(api_key="", suno=client)
        with patch.object(review.threading.Thread, "start"):
            job = service.regenerate("abomination", "attack", "One short dry monster grunt",
                                     "suno-request-00000001", provider="suno")
        return service, job

    def run_suno(self, service, job, audio=b"test audio" * 100, real_mastering=False):
        def candidate(job, index, path, source):
            return {"index": index, "source": source}
        with patch.object(review.urllib.request, "urlopen", side_effect=lambda *a, **k: io.BytesIO(audio)):
            if real_mastering:
                service.generate_suno(job)
            else:
                with patch.object(review, "prepare_candidate", side_effect=candidate):
                    service.generate_suno(job)

    def test_suno_generates_two_mastered_takes_and_applies_with_accurate_provenance(self):
        assets, _ = self.fixture()
        raw = self.work / "test-suno.mp3"
        mastering.ffmpeg("-v", "error", "-y", "-f", "lavfi", "-i",
                         "sine=frequency=440:duration=0.35:sample_rate=48000", "-c:a", "libmp3lame", raw)
        suno = FakeSuno()
        service, job = self.suno_job(suno)
        job["direction"] = {"prompt": job["prompt"], "visual_basis": "A broad, heavy undead brute."}
        job["direction_context"] = {"images": [{"kind": "battlefield", "key": "abomination_current", "sha256": "a" * 64}],
                                    "creature": {"name": "Abomination", "abilities": []}}
        self.run_suno(service, job, raw.read_bytes(), real_mastering=True)
        self.assertEqual(job["status"], "ready", job["errors"])
        self.assertEqual(len(job["candidates"]), 2)
        creation = [args for name, args in suno.calls if name == "sounds-create"]
        self.assertEqual(creation, [{"description": job["provider_prompt"], "loop": False,
                                    "title": "Abomination attack", "idempotency_key": job["id"]}])
        self.assertLessEqual(len(creation[0]["description"]), 500)
        self.assertTrue(creation[0]["description"].startswith("Single 1-second one-shot"))
        self.assertEqual(job["suno_clips"][0]["raw_duration_ms"], 350)
        for c in job["candidates"]:
            self.assertEqual(c["source"]["kind"], "suno-mcp")
            self.assertEqual(c["source"]["request_prompt"], job["provider_prompt"])
            self.assertEqual(c["source"]["duration_limit_ms"], 1000)
            self.assertEqual(c["source"]["prompt_direction"], job["direction"])
            self.assertEqual(c["source"]["prompt_context"], job["direction_context"])
            for m in c["result"]["encoded"].values():
                self.assertLessEqual(abs(m["lufs"] + 20), 0.75)
                self.assertLessEqual(m["true_peak_db"], -3)
                self.assertLessEqual(m["duration_ms"], 1000)
                self.assertLessEqual(m["bytes"], 32768)
        self.assertNotIn("signed-test-token", json.dumps(job))
        self.assertNotIn("prompt_influence", job)
        self.assertEqual((assets / "abomination_attack.mp3").read_bytes(), b"previous attack")
        review.apply_candidate(job, 1)
        provenance = json.loads((self.root / "audio/combat-sound-provenance.json").read_text())
        self.assertEqual(provenance["clips"][0]["source"]["clip_id"], "clip-b")
        self.assertEqual(provenance["clips"][0]["source"]["prompt_context"], job["direction_context"])
        self.assertEqual(provenance["provider"], "Mixed: see individual clip sources")
        self.assertEqual(provenance["clips"][1]["generation_id"], "keep-hurt")
        self.assertEqual((assets / "abomination_hurt.mp3").read_bytes(), b"keep hurt")
        for codec in ("mp3", "webm"):
            self.assertNotEqual((assets / ("abomination_attack." + codec)).read_bytes(), b"previous attack")
        design = json.loads((self.root / "audio/combat-sound-design.json").read_text())
        self.assertEqual(next(u for u in design["units"] if u["slug"] == "abomination")["attack"]["prompt"], job["prompt"])
        art = next(u for u in design["units"] if u["slug"] == "abomination")["art_reference"]
        self.assertEqual(art["battlefield_asset"], "abomination_current")
        self.assertEqual(art["attack_basis"], job["direction"]["visual_basis"])
        overrides = json.loads((self.root / "audio/combat-sound-overrides.json").read_text())
        self.assertEqual(overrides["abomination/attack"]["source"]["kind"], "suno-mcp")

    def test_suno_download_credit_requires_explicit_take_approval_without_new_creation(self):
        suno = FakeSuno()
        suno.needs_credit.add("clip-a")
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "needs_download_approval")
        self.assertEqual([c["index"] for c in job["candidates"]], [1])
        self.assertFalse(any(args.get("confirm") for name, args in suno.calls if name == "audio-download"))
        with patch.object(review.threading.Thread, "start"):
            with self.assertRaises(ValueError):
                service.resume_suno(job["id"], download_index=1)
            with self.assertRaises(ValueError):
                service.resume_suno(job["id"], download_index=False)
            service.resume_suno(job["id"], download_index=0)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "ready")
        self.assertEqual(len(job["candidates"]), 2)
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)
        confirmed = [args for name, args in suno.calls if name == "audio-download" and args["confirm"]]
        self.assertEqual(confirmed, [{"id": "clip-a", "format": "mp3", "confirm": True}])

    def test_suno_restarts_resume_known_clips_without_a_second_creation(self):
        suno = FakeSuno()
        suno.retrieve_timeout = True
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "interrupted")
        # Simulate a server restart while polling a batch that already has IDs.
        job["status"] = "generating"
        review.save_json(self.jobs / job["id"] / "job.json", job)
        restarted = review.ReviewService(api_key="", suno=suno)
        with patch.object(review.threading.Thread, "start"):
            recovered = restarted.resume_suno(job["id"])
        self.run_suno(restarted, recovered)
        self.assertEqual(recovered["status"], "ready")
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)

    def test_suno_unknown_creation_outcome_reuses_same_key_only_within_recovery_window(self):
        suno = FakeSuno()
        suno.create_timeout = True
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "interrupted")
        self.assertTrue(job["creation_sent"])
        created_at = job["created_at"]
        job["created_at"] = "2020-01-01T00:00:00+00:00"
        with patch.object(review.threading.Thread, "start") as start:
            with self.assertRaisesRegex(ValueError, "too old"):
                service.resume_suno(job["id"])
            start.assert_not_called()
            job["created_at"] = created_at
            service.resume_suno(job["id"])
        # Credit checks may now fail because the lost request used the last credits.
        with patch.object(service, "check_suno", side_effect=AssertionError("Do not charge/check for a new batch")):
            self.run_suno(service, job)
        creations = [args for name, args in suno.calls if name == "sounds-create"]
        self.assertEqual(len(creations), 2)
        self.assertEqual(creations[0], creations[1])
        self.assertEqual(job["status"], "ready")

    def test_suno_uncertain_confirmed_download_is_not_reapproved_on_restart(self):
        suno = FakeSuno()
        suno.needs_credit.add("clip-a")
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        with patch.object(review.threading.Thread, "start"):
            service.resume_suno(job["id"], download_index=0)
        suno.download_timeout = True
        self.run_suno(service, job)
        self.assertEqual(job["suno_clips"][0]["state"], "download_uncertain")
        self.assertEqual(job["status"], "ready")
        # Also handle termination between sending confirmation and receiving it.
        job["status"] = "generating"
        job["suno_clips"][0]["state"] = "download_requested"
        review.save_json(self.jobs / job["id"] / "job.json", job)
        restarted = review.ReviewService(api_key="", suno=suno)
        recovered = restarted.jobs[job["id"]]
        self.assertEqual(recovered["suno_clips"][0]["state"], "download_uncertain")
        with self.assertRaises(ValueError):
            restarted.resume_suno(job["id"], download_index=0)
        self.assertEqual(sum(name == "audio-download" and args["confirm"] for name, args in suno.calls), 1)

    def test_provider_selection_and_unsupported_similarity_cannot_misroute_a_paid_request(self):
        suno = FakeSuno()
        service, job = self.suno_job(suno)
        with patch.object(review.threading.Thread, "start") as start:
            duplicate = service.regenerate(job["slug"], job["role"], job["prompt"], job["id"], provider="suno")
            self.assertIs(duplicate, job)
            with self.assertRaisesRegex(ValueError, "another sound provider"):
                service.regenerate(job["slug"], job["role"], job["prompt"], job["id"], provider="elevenlabs")
            with self.assertRaisesRegex(ValueError, "Reference-audio"):
                service.regenerate(job["slug"], job["role"], job["prompt"], "suno-similar-00000001",
                                   mode="similar", provider="suno")
            with self.assertRaisesRegex(ValueError, "2000"):
                service.regenerate(job["slug"], job["role"], "x" * 2001, "long-request-00000001", provider="suno")
            start.assert_not_called()
        self.assertEqual(suno.calls, [])

    def test_suno_crops_and_masters_an_overlong_take_and_retains_reproducible_edit(self):
        self.work.mkdir(parents=True, exist_ok=True)
        raw = self.work / "overlong-suno.mp3"
        mastering.ffmpeg("-v", "error", "-y", "-f", "lavfi", "-i",
                         "sine=frequency=440:duration=3.4:sample_rate=48000", "-c:a", "libmp3lame", raw)
        service, job = self.suno_job(FakeSuno())
        self.run_suno(service, job, raw.read_bytes(), real_mastering=True)
        self.assertEqual(job["status"], "ready", job["errors"])
        self.assertEqual(len(job["candidates"]), 2)
        for candidate in job["candidates"]:
            self.assertTrue(candidate["source"]["crop_to_duration"])
            edit = candidate["source"]["duration_edit"]
            self.assertGreaterEqual(edit["original_duration_ms"], 3400)
            self.assertLessEqual(edit["end_ms"] - edit["start_ms"], 1000)
            self.assertIn(edit["fade_out_ms"], (20, 40))
            self.assertEqual((self.root / candidate["path"]).read_bytes(), raw.read_bytes())
            for encoded in candidate["result"]["encoded"].values():
                self.assertLessEqual(encoded["duration_ms"], 1000)
                self.assertLessEqual(abs(encoded["lufs"] + 20), 0.75)
                self.assertLessEqual(encoded["true_peak_db"], -3)
                self.assertLessEqual(encoded["leading_quiet_ms"], 25)
                self.assertLessEqual(encoded["trailing_quiet_ms"], 65)
        # A later mastering pass uses the original and the saved editing policy.
        candidate = job["candidates"][0]
        remastered = mastering.master("abomination/attack", [{"path": self.root / candidate["path"],
                                      "unit": job["unit"], "slug": job["slug"], "role": job["role"],
                                      "source_id": candidate["source_id"], "source": candidate["source"]}],
                                      self.work / "remaster", self.work / "remaster/assets")
        self.assertEqual(remastered["source"]["duration_edit"], candidate["source"]["duration_edit"])
        self.assertFalse((self.root / "public/audio/combat").exists())

    def test_suno_generates_listening_links_without_download_credits_and_can_download_later(self):
        suno = FakeSuno()
        service, job = self.suno_job(suno)
        self.assertTrue(service.check_suno()["available"])
        suno.download_credits = 0
        saved_while_second_take_pending = []
        call = suno.call
        def retrieve(name, arguments):
            if name == "audio-retrieve" and arguments["id"] == "clip-b":
                saved_while_second_take_pending.append(json.loads((self.jobs / job["id"] / "job.json").read_text()))
            return call(name, arguments)
        # Re-read the balance before creation, then publish each take independently.
        with patch.object(suno, "call", side_effect=retrieve):
            self.run_suno(service, job)
        self.assertEqual(job["status"], "download_blocked")
        self.assertTrue(job["listen_only"])
        self.assertEqual(job["errors"], [])
        self.assertEqual(job["candidates"], [])
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)
        self.assertFalse(any(name == "audio-download" for name, _ in suno.calls))
        self.assertEqual(len(saved_while_second_take_pending), 1)
        first = saved_while_second_take_pending[0]
        self.assertEqual(first["status"], "generating")
        self.assertTrue(first["suno_clips"][0]["generation_complete"])
        self.assertEqual(first["suno_clips"][0]["song_url"], "https://suno.com/song/clip-a")
        self.assertEqual(first["suno_clips"][1]["state"], "pending")
        self.assertTrue(all(c["generation_complete"] and c["song_url"] for c in job["suno_clips"]))
        status = service.check_suno()
        self.assertTrue(status["connected"])
        self.assertTrue(status["available"])
        self.assertFalse(status["downloads_available"])
        self.assertEqual(status["generation_credits"], 20)
        self.assertEqual(status["download_credits"], 0)
        self.assertEqual(status["error"], "")
        self.assertIn("listen on Suno", status["download_note"])
        # Keep both original clip IDs through restart and explicit download recovery.
        suno.download_credits = 2
        suno.needs_credit.update({"clip-a", "clip-b"})
        restarted = review.ReviewService(api_key="", suno=suno)
        with patch.object(review.threading.Thread, "start"):
            recovered = restarted.resume_suno(job["id"])
        self.run_suno(restarted, recovered)
        self.assertEqual(recovered["status"], "needs_download_approval")
        self.assertFalse(recovered["listen_only"])
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)
        self.assertFalse(any(args.get("confirm") for name, args in suno.calls if name == "audio-download"))
        with patch.object(review.threading.Thread, "start"):
            restarted.resume_suno(job["id"], download_index=0)
        self.run_suno(restarted, recovered)
        self.assertEqual(len(recovered["candidates"]), 1)
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)

    def test_suno_can_generate_for_listening_without_download_entitlement(self):
        suno = FakeSuno()
        suno.features = []
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertTrue(service.check_suno()["available"])
        self.assertEqual(job["status"], "download_blocked")
        self.assertEqual(job["errors"], [])
        self.assertEqual(len(job["suno_clips"]), 2)
        self.assertFalse(any(name == "audio-download" for name, _ in suno.calls))

    def test_suno_listening_still_requires_generation_credits(self):
        suno = FakeSuno()
        suno.generation_credits = 0
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "failed")
        self.assertFalse(service.check_suno()["available"])
        self.assertFalse(any(name == "sounds-create" for name, _ in suno.calls))
        self.assertIn("generation credits", job["errors"][-1]["message"])

    def test_explicit_download_credit_refusal_is_recoverable_without_new_generation(self):
        suno = FakeSuno()
        suno.needs_credit.add("clip-a")
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        with patch.object(review.threading.Thread, "start"):
            service.resume_suno(job["id"], download_index=0)
        suno.reject_download = True
        self.run_suno(service, job)
        self.assertEqual(job["status"], "download_blocked")
        self.assertEqual(job["suno_clips"][0]["state"], "download_blocked")
        self.assertEqual(job["suno_clips"][0]["song_url"], "https://suno.com/song/clip-a")
        self.assertEqual(job["errors"][-1]["code"], "insufficient_credits")
        self.assertEqual(job["errors"][-1]["reason"], "quota_exhausted")
        before = len(suno.calls)
        with self.assertRaisesRegex(ValueError, "no download credits"):
            service.resume_suno(job["id"], download_index=0)
        self.assertFalse(any(name == "audio-download" for name, _ in suno.calls[before:]))
        # Rechecking a saved batch spends neither generation nor download credits.
        suno.download_credits = 2
        suno.reject_download = False
        with patch.object(review.threading.Thread, "start"):
            service.resume_suno(job["id"])
        self.run_suno(service, job)
        self.assertEqual(job["status"], "needs_download_approval")
        self.assertEqual(sum(name == "audio-download" and args["confirm"] for name, args in suno.calls), 1)
        with patch.object(review.threading.Thread, "start"):
            service.resume_suno(job["id"], download_index=0)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "ready")
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)

    def test_old_insufficient_credit_jobs_recover_saved_clip_ids_on_restart(self):
        suno = FakeSuno()
        service, job = self.suno_job(suno)
        job.update({"status": "failed", "creation_sent": True, "suno_clips": [
            {"clip_id": "saved-clip", "index": 0, "state": "download_uncertain"}],
            "errors": [{"index": 0, "message": "Suno returned insufficient_credits; no automatic creation retry was sent."}]})
        review.save_json(self.jobs / job["id"] / "job.json", job)
        restarted = review.ReviewService(api_key="", suno=suno)
        recovered = restarted.jobs[job["id"]]
        self.assertEqual(recovered["status"], "download_blocked")
        self.assertEqual(recovered["suno_clips"][0]["clip_id"], "saved-clip")
        self.assertEqual(recovered["errors"][0]["code"], "insufficient_credits")
        self.assertEqual(suno.calls, [])
        self.assertEqual(json.loads((self.jobs / job["id"] / "job.json").read_text())["status"], "download_blocked")

    def test_explicit_generation_refusal_is_not_an_uncertain_creation(self):
        suno = FakeSuno()
        suno.reject_generation = True
        service, job = self.suno_job(suno)
        self.run_suno(service, job)
        self.assertEqual(job["status"], "failed")
        self.assertFalse(job["creation_sent"])
        with self.assertRaises(ValueError):
            service.resume_suno(job["id"])
        self.assertEqual(sum(name == "sounds-create" for name, _ in suno.calls), 1)

    def test_bridge_retains_safe_error_code_and_reason_without_raw_provider_details(self):
        client = review.SunoMcp(self.root)
        payload = {"isError": True, "structuredContent": {"code": "insufficient_credits",
                   "reason": "quota_exhausted", "error": "provider detail containing private-test-token"}}
        with patch.object(client, "_connect"), patch.object(client, "_rpc", return_value=payload):
            with self.assertRaises(review.SunoToolError) as failure:
                client.call("audio-download", {"id": "saved-clip", "confirm": False})
        self.assertEqual(failure.exception.tool, "audio-download")
        self.assertEqual(failure.exception.reason, "quota_exhausted")
        self.assertIn("download credits", str(failure.exception))
        self.assertNotIn("private-test-token", str(failure.exception))

    def test_catalog_recovers_saved_page_when_temporary_report_is_missing(self):
        self.fixture()
        report_path = self.work / "mastering-report.json"
        clips = json.loads(report_path.read_text())["clips"]
        clips[0].update({"waveform": [0.1, 0.5, 0.2], "source_file": "tmp/audio/raw/old.mp3",
                         "alternates": [{"source_id": "old-attack", "score": 0.8}]})
        mastering.write_review(self.work, clips)
        report_path.unlink()
        service = review.ReviewService(api_key="test-private-key-never-sent-to-browser")
        server = ThreadingHTTPServer(("127.0.0.1", 0), review.ReviewHandler)
        server.service = service
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        url = f"http://127.0.0.1:{server.server_port}/api/audio/catalog"
        try:
            with urllib.request.urlopen(url) as response:
                catalog = json.loads(response.read())
            self.assertTrue(catalog["can_generate"])
            self.assertTrue(catalog["regeneration"]["fresh"])
            self.assertFalse(catalog["regeneration"]["similar"])
            self.assertIn("Reference-audio", catalog["regeneration"]["similar_unavailable"])
            combat = [c for c in catalog["sounds"] if c["role"] in ("attack", "hurt")]
            self.assertEqual(combat, clips)
            self.assertEqual(len([c for c in catalog["sounds"] if c["role"] == "cast"]),
                             len(mastering.spell_placeholders()))
            self.assertTrue(combat[0]["design_prompt"])
            self.assertNotIn(service.api_key, json.dumps(catalog))
            self.assertFalse(report_path.exists())
            # A missing page too must yield a usable error, not drop the HTTP connection.
            (self.work / "review.html").unlink()
            with self.assertRaises(urllib.error.HTTPError) as unavailable:
                urllib.request.urlopen(url)
            with unavailable.exception as response:
                self.assertEqual(response.code, 503)
                self.assertIn("Restore", json.loads(response.read())["error"])
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_applying_a_take_recovers_report_without_losing_other_saved_clips(self):
        assets, job = self.fixture()
        report_path = self.work / "mastering-report.json"
        clips = json.loads(report_path.read_text())["clips"]
        mastering.write_review(self.work, clips)
        report_path.unlink()
        review.apply_candidate(job, 0)
        restored = json.loads(report_path.read_text())["clips"]
        self.assertEqual(len(restored), 2)
        self.assertEqual(restored[0]["source_id"], "selected-file")
        self.assertEqual(restored[1], clips[1])
        self.assertEqual((assets / "abomination_attack.webm").read_bytes(), b"mastered opus")
        self.assertEqual((assets / "abomination_attack.mp3").read_bytes(), b"mastered mp3")
        self.assertEqual((assets / "abomination_hurt.webm").read_bytes(), b"keep hurt")

    def test_missing_report_and_page_does_not_partially_apply_a_take(self):
        assets, job = self.fixture()
        (self.work / "mastering-report.json").unlink()
        with self.assertRaises(FileNotFoundError):
            review.apply_candidate(job, 0)
        self.assertEqual((assets / "abomination_attack.webm").read_bytes(), b"previous attack")
        self.assertEqual((assets / "abomination_attack.mp3").read_bytes(), b"previous attack")
        manifest = json.loads((self.root / "src/ui/audio/combatSoundManifest.json").read_text())
        self.assertEqual(manifest["Abomination"]["attack"]["revision"], "old")
        self.assertFalse((self.root / "audio/combat-sound-overrides.json").exists())

    def test_applying_a_take_updates_both_codecs_and_catalogs_while_preserving_hurt(self):
        assets, job = self.fixture()
        result = review.apply_candidate(job, 0)
        opus = (assets / "abomination_attack.webm").read_bytes()
        mp3 = (assets / "abomination_attack.mp3").read_bytes()
        self.assertEqual(result["revision"], hashlib.sha256(opus + mp3).hexdigest()[:10])
        manifest = json.loads((self.root / "src/ui/audio/combatSoundManifest.json").read_text())
        self.assertEqual(manifest["Abomination"]["attack"]["revision"], result["revision"])
        self.assertEqual(manifest["Abomination"]["hurt"]["revision"], "keep")
        self.assertEqual((assets / "abomination_hurt.webm").read_bytes(), b"keep hurt")
        self.assertEqual((assets / "abomination_hurt.mp3").read_bytes(), b"keep hurt")
        overrides = json.loads((self.root / "audio/combat-sound-overrides.json").read_text())
        self.assertEqual(overrides["abomination/attack"]["source_id"], "selected-file")
        provenance = json.loads((self.root / "audio/combat-sound-provenance.json").read_text())
        self.assertEqual(provenance["clips"][1]["generation_id"], "keep-hurt")

    def test_missing_candidate_codec_does_not_replace_the_shipped_sound(self):
        assets, job = self.fixture(missing_mp3=True)
        with self.assertRaises(ValueError):
            review.apply_candidate(job, 0)
        self.assertEqual((assets / "abomination_attack.webm").read_bytes(), b"previous attack")
        self.assertEqual((assets / "abomination_attack.mp3").read_bytes(), b"previous attack")

    def test_selected_generated_prompt_becomes_the_default_for_later_regeneration(self):
        _, job = self.fixture()
        prompt = "One sharp dry heavy steel sword slash through the air"
        job["candidates"][0]["source"].update({"kind": "elevenlabs-api", "prompt": prompt})
        review.apply_candidate(job, 0)
        design = json.loads((self.root / "audio/combat-sound-design.json").read_text())
        unit = next(u for u in design["units"] if u["slug"] == "abomination")
        self.assertEqual(unit["attack"]["prompt"], prompt)
        report = json.loads((self.work / "mastering-report.json").read_text())
        self.assertEqual(report["clips"][0]["design_prompt"], prompt)

    def test_freesound_refresh_keeps_the_downloaded_catalog(self):
        folder = self.work / "freesound" / "cc0-spell-cast"
        folder.mkdir(parents=True)
        original = json.dumps({"sounds": [{
            "id": 1, "name": "kept", "username": "a",
            "license": "http://creativecommons.org/publicdomain/zero/1.0/",
            "preview": "1.ogg", "sha256": "abc",
            "page": "https://freesound.org/people/a/sounds/1/",
        }]})
        index = folder / "index.json"
        index.write_text(original)
        payload = json.dumps({"next": None, "results": [{
            "id": 2, "name": "live", "username": "b",
            "license": "http://creativecommons.org/publicdomain/zero/1.0/",
            "duration": 1.2, "previews": {"preview-hq-ogg": "https://freesound.org/data/previews/2.ogg"},
        }]}).encode()

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return payload

        with patch.object(review.urllib.request, "urlopen", return_value=Response()):
            sounds = review.freesound_spell_casts("token-should-not-be-stored")
        self.assertEqual(index.read_text(), original)
        self.assertEqual(sounds[0]["id"], 2)
        self.assertEqual(sounds[0]["page"], "https://freesound.org/people/b/sounds/2/")
        saved = (folder / "search.json").read_text()
        self.assertNotIn("token-should-not-be-stored", saved)
        with patch.object(review.urllib.request, "urlopen", side_effect=urllib.error.URLError("offline")):
            (folder / "search.json").unlink()
            fallback = review.freesound_spell_casts("token-should-not-be-stored")
        self.assertEqual(fallback[0]["preview"], "1.ogg")
        self.assertEqual(index.read_text(), original)

    def test_each_click_claims_the_next_saved_preview_without_leaving_the_cache(self):
        folder = self.work / "freesound" / "cc0-spell-cast"
        folder.mkdir(parents=True)
        secret = folder.parent / "secret.ogg"
        secret.write_bytes(b"secret-bytes" + b"x" * 500)
        (folder / "5.ogg").write_bytes(b"preview-5" + b"y" * 500)
        sounds = [
            {"id": 4, "name": "outside", "username": "a",
             "license": "http://creativecommons.org/publicdomain/zero/1.0/", "preview": "../secret.ogg"},
            {"id": 5, "name": "local", "username": "a",
             "license": "http://creativecommons.org/publicdomain/zero/1.0/", "preview": "5.ogg"},
        ]
        with patch.object(review, "freesound_spell_casts", return_value=[review.freesound_record(s) for s in sounds]):
            with self.assertRaises(ValueError):
                review.download_freesound_preview({"id": 4, "preview": "../secret.ogg", "preview_url": ""})
            self.assertTrue(secret.read_bytes().startswith(b"secret-bytes"))
            first = review.claim_next_freesound("test-key")
            self.assertEqual(first["id"], 4)
            second = review.claim_next_freesound("test-key")
            path = review.download_freesound_preview(second)
        self.assertEqual(second["id"], 5)
        self.assertEqual(path, (folder / "5.ogg").resolve())
        with patch.object(review, "freesound_spell_casts", return_value=[review.freesound_record(s) for s in sounds]):
            with self.assertRaises(ValueError):
                review.claim_next_freesound("test-key")

    def test_spell_next_sound_skips_silence_and_masters_the_following_clip(self):
        self.work.mkdir(parents=True, exist_ok=True)
        silent = self.work / "silent.wav"
        tone = self.work / "tone.wav"
        mastering.ffmpeg("-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                         "-t", "0.4", "-c:a", "pcm_s16le", silent)
        mastering.ffmpeg("-v", "error", "-y", "-f", "lavfi", "-i",
                         "sine=frequency=440:duration=0.45:sample_rate=48000", "-c:a", "pcm_s16le", tone)
        sounds = [
            {"id": 11, "name": "silent-room", "username": "a",
             "license": "http://creativecommons.org/publicdomain/zero/1.0/", "page": "https://freesound.org/people/a/sounds/11/"},
            {"id": 22, "name": "bell-tone", "username": "b",
             "license": "http://creativecommons.org/publicdomain/zero/1.0/", "page": "https://freesound.org/people/b/sounds/22/"},
        ]

        def download(sound):
            return silent if sound["id"] == 11 else tone

        def offline(*args, **kwargs):
            raise AssertionError("spell regeneration must not call a network API")

        service = review.ReviewService(api_key="")
        with patch.object(review, "freesound_api_key", return_value="test-freesound-key"), \
             patch.object(review, "freesound_spell_casts", return_value=[review.freesound_record(s) for s in sounds]), \
             patch.object(review, "download_freesound_preview", side_effect=download), \
             patch.object(review.urllib.request, "urlopen", side_effect=offline):
            job = service.regenerate_spell("spell-heal", "spell-request-000001")
            deadline = time.time() + 90
            while job["status"] == "generating" and time.time() < deadline:
                time.sleep(0.05)
        self.assertEqual(job["status"], "ready", job.get("errors"))
        self.assertEqual([item["source"]["freesound_id"] for item in job["candidates"]], [22])
        self.assertEqual(job["candidates"][0]["source"]["page_url"], "https://freesound.org/people/b/sounds/22/")
        self.assertTrue(any("silent-room" in item["message"] for item in job["errors"]))
        for metrics in job["candidates"][0]["result"]["encoded"].values():
            self.assertLessEqual(abs(metrics["lufs"] + 20), 0.75)
            self.assertLessEqual(metrics["true_peak_db"], -3)
            self.assertGreaterEqual(metrics["duration_ms"], 75)
            self.assertLessEqual(metrics["duration_ms"], 2500)
            self.assertLessEqual(metrics["bytes"], 32768)
            self.assertLessEqual(metrics["leading_quiet_ms"], 25)
            self.assertLessEqual(metrics["trailing_quiet_ms"], 65)
        cursor = json.loads((self.work / "freesound-spell-cursor.json").read_text())
        self.assertEqual(cursor["used"], [11, 22])
        self.assertNotIn("test-freesound-key", json.dumps(job))
        self.assertFalse((self.root / "public/audio/combat").exists())

    def test_applying_a_spell_leaves_creature_combat_files_untouched(self):
        assets, _ = self.fixture()
        staged = self.jobs / "spell-job/0/assets"
        staged.mkdir(parents=True)
        (staged / "spell-heal_cast.webm").write_bytes(b"spell opus")
        (staged / "spell-heal_cast.mp3").write_bytes(b"spell mp3")
        body = {"unit": "Heal", "slug": "spell-heal", "role": "cast", "source_id": "freesound-22",
                "source": {"kind": "freesound", "filename": "bell-tone"},
                "encoded": {"webm": {"duration_ms": 400, "lufs": -20.0, "true_peak_db": -3.1, "bytes": 10}}}
        candidate = {"index": 0, "source_id": "freesound-22", "source": body["source"],
                     "path": "tmp/audio/freesound/cc0-spell-cast/22.ogg", "result": body,
                     "asset_base": str((staged / "spell-heal_cast").relative_to(self.root))}
        job = {"id": "spell-job", "slug": "spell-heal", "role": "cast", "candidates": [candidate], "status": "ready"}
        applied = review.apply_candidate(job, 0)
        self.assertEqual(applied["role"], "cast")
        self.assertEqual((self.root / "public/audio/spells/spell-heal.webm").read_bytes(), b"spell opus")
        self.assertEqual((self.root / "public/audio/spells/spell-heal.mp3").read_bytes(), b"spell mp3")
        self.assertEqual((assets / "abomination_attack.webm").read_bytes(), b"previous attack")
        self.assertEqual((assets / "abomination_attack.mp3").read_bytes(), b"previous attack")
        self.assertEqual((assets / "abomination_hurt.webm").read_bytes(), b"keep hurt")
        manifest = json.loads((self.root / "src/ui/audio/combatSoundManifest.json").read_text())
        self.assertEqual(manifest["Abomination"]["attack"]["revision"], "old")
        self.assertEqual(manifest["Abomination"]["hurt"]["revision"], "keep")
        self.assertFalse((self.root / "audio/combat-sound-overrides.json").exists())
        report = json.loads((self.work / "spell-sound-report.json").read_text())
        self.assertEqual(report["clips"][0]["asset_base"], "public/audio/spells/spell-heal")
        page = (self.work / "review.html").read_text()
        self.assertIn("spell-heal", page)
        self.assertNotIn("__COMBAT_AUDIO_DATA__", page)


if __name__ == "__main__":
    unittest.main()
