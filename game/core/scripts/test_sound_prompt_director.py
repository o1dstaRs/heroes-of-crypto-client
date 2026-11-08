import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from sound_prompt_director import SoundPromptDirector, image_path, sound_context, validate_direction


class SoundPromptDirectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.core = Path(self.directory.name) / "game/core"
        config = self.core.parent / "heroes-of-crypto-common/src/configuration"
        for folder in (self.core / "audio", self.core / "images", self.core / "src/pixi", config):
            folder.mkdir(parents=True)
        self.environment = patch.dict("os.environ", {"HOC_IMAGES_LOC": "", "HOC_ANIMATIONS_LOC": ""})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.old_prompt = "A low rushing flame lash with a soft airy tail."
        (self.core / "audio/combat-sound-design.json").write_text(json.dumps({
            "style": "Dry, tactile dark-fantasy combat; one short event, no music.",
            "units": [{"slug": "fixture-spirit", "name": "Fixture Spirit",
                       "attack": {"prompt": self.old_prompt, "duration_seconds": 1}}],
        }))
        (config / "creatures.json").write_text(json.dumps({"Chaos": {"Fixture Spirit": {
            "description": "A spirit of living fire.", "abilities": ["Fire Shield"],
            "attack_type": "MELEE", "movement_type": "FLY", "level": 3, "size": 1,
        }}}))
        (config / "abilities.json").write_text(json.dumps({
            "Fire Shield": {"desc": ["Returns {}% of melee damage as fire."], "power": 40},
        }))
        (self.core / "src/pixi/creaturePortraitAssetKeys.ts").write_text(
            'export const REQUIRED_FULL_BODY_PORTRAIT_SOURCES: Record<string, string[]> = {\n'
            '  "Fixture Spirit": ["fixture_portrait_v3", "fixture_portrait_v2"],\n};')
        (self.core / "src/pixi/battlefieldTextureKeys.ts").write_text(
            'export const keys = {\n  fixture_spirit: "fixture_battlefield_v2",\n};')
        for key in ("fixture_portrait_v3", "fixture_portrait_v2", "fixture_battlefield_v2"):
            (self.core / "images" / (key + ".webp")).write_bytes(key.encode())
        self.direction = {
            "prompt": "One sharp palm ignition pop opens into a compact coarse combustion burst, ending in a tiny ember fizz. Dry, close, under one second, no voice, music or victim impact.",
            "concept": "Palm ignition",
            "visual_basis": "An open flaming hand extends forward; no held weapon is visible.",
            "reason": "A brief burst matches the palm thrust and elemental body.",
            "changes": "Replaces a continuous airy lash with a sharp pop and granular finish.",
        }

    def test_context_uses_current_game_selectors_abilities_and_portable_image_provenance(self):
        context, images = sound_context(self.core, "fixture-spirit", "attack")
        self.assertEqual([i["key"] for i in context["images"]],
                         ["fixture_portrait_v3", "fixture_battlefield_v2"])
        self.assertTrue(all(p.is_absolute() and p.is_file() for p in images))
        self.assertTrue(all(len(i["sha256"]) == 64 for i in context["images"]))
        self.assertNotIn(str(self.core), json.dumps(context))
        self.assertEqual(context["creature"]["description"], "A spirit of living fire.")
        self.assertEqual(context["creature"]["abilities"][0]["description"],
                         "Returns 40% of melee damage as fire.")
        self.assertIn("dark-fantasy", context["game_sound_style"])

    def test_missing_art_and_unsafe_image_keys_fail_instead_of_guessing(self):
        (self.core / "images/fixture_battlefield_v2.webp").unlink()
        with self.assertRaisesRegex(ValueError, "artwork is unavailable"):
            sound_context(self.core, "fixture-spirit", "attack")
        with self.assertRaisesRegex(ValueError, "Invalid creature image key"):
            image_path(self.core, "../../private")

    def test_exact_and_near_copy_prompts_are_rejected(self):
        for repeated in (self.old_prompt, self.old_prompt.replace("soft", "brief")):
            with self.subTest(prompt=repeated), self.assertRaisesRegex(ValueError, "too similar"):
                validate_direction({**self.direction, "prompt": repeated}, [self.old_prompt], 310)
        self.assertEqual(validate_direction(dict(self.direction), [self.old_prompt], 310), self.direction)

    def test_real_model_request_attaches_images_and_rejected_history_in_isolated_inference(self):
        context, images = sound_context(self.core, "fixture-spirit", "attack")
        history = [{"prompt": "A sizzling flame ribbon unfurls.", "concept": "Fire ribbon"}]

        def run(args, **kwargs):
            self.assertIn("--ignore-user-config", args)
            self.assertIn("--ephemeral", args)
            self.assertEqual(args[args.index("--sandbox") + 1], "read-only")
            self.assertIn("shell_tool", args)
            self.assertEqual([args[i + 1] for i, a in enumerate(args) if a == "--image"],
                             [str(p) for p in images])
            self.assertIn("at most 310 characters", kwargs["input"])
            self.assertIn(self.old_prompt, kwargs["input"])
            self.assertIn("Fire ribbon", kwargs["input"])
            self.assertIn("Less airy, more physical", kwargs["input"])
            self.assertIn("Returns 40%", kwargs["input"])
            self.assertEqual(kwargs["timeout"], 180)
            Path(args[args.index("--output-last-message") + 1]).write_text(json.dumps(self.direction))
            return type("Result", (), {"returncode": 0})()

        with patch("sound_prompt_director.shutil.which", return_value="codex"), \
                patch("sound_prompt_director.subprocess.run", side_effect=run) as model:
            actual = SoundPromptDirector().rewrite(context, images, self.old_prompt, history,
                                                  "Less airy, more physical", 310)
        self.assertEqual(actual, self.direction)
        model.assert_called_once()

    def test_model_failure_has_no_old_prompt_fallback(self):
        context, images = sound_context(self.core, "fixture-spirit", "attack")
        with patch("sound_prompt_director.shutil.which", return_value="codex"), \
                patch("sound_prompt_director.subprocess.run") as model:
            model.return_value.returncode = 1
            with self.assertRaisesRegex(RuntimeError, "no audio was generated"):
                SoundPromptDirector().rewrite(context, images, self.old_prompt, [], "", 310)


if __name__ == "__main__":
    unittest.main()
