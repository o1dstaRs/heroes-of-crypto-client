import array
import json
import math
from pathlib import Path
import tempfile
import unittest

from prepare_combat_audio import (
    CASTABLE_SCHOOLS,
    CREATURES_JSON,
    RATE,
    SPELLS_JSON,
    crop_one_shot,
    decode,
    fade_edges,
    loudness,
    master,
    spell_placeholders,
    trim_bounds,
    write_wave,
)


class CombatMasteringTests(unittest.TestCase):
    def tone(self, seconds):
        return [0.1 * math.sin(2 * math.pi * 440 * i / RATE) for i in range(int(seconds * RATE))]

    def test_spell_placeholders_are_the_castable_spells_only(self):
        spells = json.loads(SPELLS_JSON.read_text())
        rows = spell_placeholders()
        names = [row["unit"] for row in rows]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(all(row["role"] == "cast" and row["placeholder"] and "encoded" not in row for row in rows))
        for school in CASTABLE_SCHOOLS:
            for name in spells[school]:
                self.assertIn(name, names)
        for name in ("Craft", "Armor Rune", "Weapon Rune"):
            self.assertIn(name, names)
        for name in ("Morale", "Titan Plate", "Resurrection", "Gravechain"):
            self.assertNotIn(name, names)
        self.assertEqual(len(names), sum(len(spells[school]) for school in CASTABLE_SCHOOLS) + 3)
        self.assertTrue(CREATURES_JSON.is_file())

    def test_trims_only_edges_preserving_internal_pause(self):
        samples = array.array("f", [0] * 4800 + self.tone(0.15) + [0] * 4800 + self.tone(0.15) + [0] * 9600)
        start, end = trim_bounds(samples)
        self.assertGreater(start, 4000)
        self.assertLess(end, len(samples) - 7000)
        self.assertGreater((end - start) / RATE, 0.4)

    def test_rejects_empty_sources_and_fades_to_zero(self):
        with self.assertRaises(ValueError):
            trim_bounds(array.array("f", [0] * RATE))
        with self.assertRaises(ValueError):
            trim_bounds(array.array("f", [1e-6] * RATE))
        faded = fade_edges(array.array("f", self.tone(0.2)))
        self.assertEqual(faded[0], 0)
        self.assertEqual(faded[-1], 0)

    def test_sub_400ms_effect_survives_both_codecs_and_hits_the_loudness_target(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / "tmp") as folder:
            work = Path(folder)
            # Make a source with quiet edges and a short high-crest event.
            source = work / "source.wav"
            write_wave(source, array.array("f", [0] * 4800 + self.tone(0.18) + [0] * 4800))
            result = master("test/attack", [{"path": source, "unit": "test", "slug": "test", "role": "attack", "generation_id": "test"}], work, work / "output")
            for codec in ("webm", "mp3"):
                path = work / "output" / ("test_attack." + codec)
                measured = loudness(path)
                self.assertLess(abs(measured["lufs"] + 20), 0.75)
                self.assertLessEqual(measured["true_peak_db"], -3)
                self.assertLess(len(decode(path)) / RATE, 0.4)
                self.assertLess(result["encoded"][codec]["bytes"], 32768)

    def test_source_duration_limit_rejects_a_long_performance_before_encoding(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / "tmp") as folder:
            work = Path(folder)
            source = work / "long.wav"
            write_wave(source, array.array("f", self.tone(1.2)))
            record = {"path": source, "unit": "test", "slug": "test", "role": "attack",
                      "source_id": "long-take", "source": {"kind": "suno-mcp", "duration_limit_ms": 1000}}
            # This would fit the global 1.6 s cap, but must also fit the requested 1 s.
            with self.assertRaisesRegex(ValueError, "exceeds the 1000 ms limit"):
                master("test/attack", [record], work, work / "output")
            self.assertFalse((work / "output").exists())

    def test_long_silence_padding_does_not_reject_a_short_complete_event(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / "tmp") as folder:
            work = Path(folder)
            source = work / "padded.wav"
            write_wave(source, array.array("f", [0] * RATE + self.tone(0.25) + [0] * RATE * 2))
            record = {"path": source, "unit": "test", "slug": "test", "role": "attack",
                      "source_id": "padded-take", "source": {"kind": "suno-mcp", "duration_limit_ms": 1000}}
            result = master("test/attack", [record], work, work / "output")
            self.assertEqual(result["raw_duration_ms"], 3250)
            self.assertEqual(result["source"]["duration_limit_ms"], 1000)
            for encoded in result["encoded"].values():
                self.assertLessEqual(encoded["duration_ms"], 1000)
                self.assertGreaterEqual(encoded["duration_ms"], 250)

    def test_crop_selects_a_complete_strong_event_and_keeps_original_pcm(self):
        samples = array.array("f", [0] * 4800 + [v * 0.2 for v in self.tone(0.3)] + [0] * 9600 +
                              self.tone(0.45) + [0] * 4800 + [v * 0.3 for v in self.tone(1.8)])
        original = samples.tobytes()
        start, end = trim_bounds(samples)
        left, right, edit = crop_one_shot(samples, start, end, 1000)
        self.assertGreater(left / RATE, 0.55)
        self.assertLess(left / RATE, 0.65)
        self.assertGreater(right / RATE, 1.04)
        self.assertLess(right / RATE, 1.1)
        self.assertTrue(edit["natural_ending"])
        self.assertEqual(edit["fade_out_ms"], 20)
        self.assertEqual(samples.tobytes(), original)

    def test_crop_uses_a_quiet_dip_and_fades_an_unfinished_tail_to_zero(self):
        # A continuous 3.4 s performance, with a valley at 0.75 s and louder audio afterwards.
        tone = self.tone(3.4)
        for i in range(len(tone)):
            t = i / RATE
            if 0.70 <= t <= 0.78:
                tone[i] *= 0.2
            elif t > 0.1:
                tone[i] *= 0.8
        samples = array.array("f", tone)
        start, end = trim_bounds(samples)
        left, right, edit = crop_one_shot(samples, start, end, 1000)
        self.assertLess(left / RATE, 0.02)
        self.assertGreater(right / RATE, 0.70)
        self.assertLess(right / RATE, 0.80)
        self.assertFalse(edit["natural_ending"])
        self.assertEqual(edit["fade_out_ms"], 40)
        faded = fade_edges(samples[left:right], fade_out_ms=edit["fade_out_ms"])
        self.assertEqual(faded[0], 0)
        self.assertEqual(faded[-1], 0)
        self.assertLess(max(abs(x) for x in faded[-48:]), 0.001)


if __name__ == "__main__":
    unittest.main()
