import array
import math
from pathlib import Path
import tempfile
import unittest

from prepare_combat_audio import RATE, decode, fade_edges, loudness, master, trim_bounds, write_wave


class CombatMasteringTests(unittest.TestCase):
    def tone(self, seconds):
        return [0.1 * math.sin(2 * math.pi * 440 * i / RATE) for i in range(int(seconds * RATE))]

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


if __name__ == "__main__":
    unittest.main()
