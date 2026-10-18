import hashlib
from http.server import ThreadingHTTPServer
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


class AudioReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=REAL_CORE / "tmp/audio")
        self.root = Path(self.directory.name)
        self.work = self.root / "tmp/audio"
        self.jobs = self.work / "revisions"
        (self.root / "audio").mkdir()
        shutil.copyfile(REAL_CORE / "audio/combat-sound-design.json", self.root / "audio/combat-sound-design.json")
        (self.root / "audio/combat-sound-review.html").write_text("__COMBAT_AUDIO_DATA__")
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
        service.generate = generate
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
