import contextlib
import csv
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("engagement_score", Path(__file__).with_name("score.py"))
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)


class ScoreTests(unittest.TestCase):
    def test_self_replies_are_excluded_without_double_counting_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            notes = "Own-reply https://example.test/own-link"
            record = dict.fromkeys(score.POST_COLS, "")
            record.update(id="post", posted_at_pt="2026-10-17 09:38", notes=notes,
                          format_tag="tactics", slot="morning", hypothesis="Keep this human note")
            score.write(root / "posts.csv", score.POST_COLS, [record])
            pull = {
                "pulled_at": "2026-10-18T16:38:00Z",
                "user": {"data": {"id": "owner", "public_metrics": {
                    "followers_count": 91, "following_count": 8, "tweet_count": 142, "listed_count": 1,
                }}},
                "posts": {"data": [
                    {"id": "post", "created_at": "2026-10-17T16:38:00Z", "public_metrics": {
                        "impression_count": 100, "like_count": 2, "reply_count": 3, "retweet_count": 1,
                    }},
                    *({"id": f"own-{i}", "in_reply_to_user_id": "owner",
                       "referenced_tweets": [{"type": "replied_to", "id": "post"}]} for i in range(2)),
                ]},
            }
            with contextlib.redirect_stdout(io.StringIO()):
                score.ingest(pull, directory)
            rows = score.read(root / "posts.csv", score.POST_COLS)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["replies_24h"], "1")
            self.assertEqual(rows[0]["er_24h"], "0.04")
            self.assertEqual(rows[0]["notes"], notes)
            self.assertEqual(rows[0]["hypothesis"], "Keep this human note")
            self.assertEqual(rows[0]["format_tag"], "tactics")
            before = {p.name: p.read_bytes() for p in root.glob("*.csv")}
            with contextlib.redirect_stdout(io.StringIO()):
                score.ingest(pull, directory)
            self.assertEqual(before, {p.name: p.read_bytes() for p in root.glob("*.csv")})
            self.assertEqual(len(score.read(root / "followers.csv", score.FOL_COLS)), 1)
            self.assertNotIn(b"\r\n", before["posts.csv"])

    def test_known_link_reply_is_subtracted_when_missing_from_pull(self):
        counts = score.self_replies_from_notes([{"id": "post", "notes": "Own-reply https://example.test/link"}])
        self.assertEqual(score.outside_reply_count(1, counts["post"]), 0)
        self.assertEqual(score.outside_reply_count(0, counts["post"]), 0)

    def test_extra_columns_fail_before_a_human_note_can_be_discarded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "posts.csv"
            with path.open("w", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(score.POST_COLS)
                writer.writerow([""] * len(score.POST_COLS) + ["Human note in an extra column"])
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "extra CSV columns"):
                score.ingest({"pulled_at": "2026-10-18T16:38:00Z"}, directory)
            self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
