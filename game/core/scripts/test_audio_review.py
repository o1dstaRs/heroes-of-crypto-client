import hashlib
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile
import threading
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


if __name__ == "__main__":
    unittest.main()
