# @Heroes0fcrypto measurement system

xcom drafts and reads. A person posts. Nothing in this system posts, replies, likes, follows, reposts, or sends.

Files in this folder:
- `BASELINE.md`: first real pull (14 Oct 2026). The only source for "before" numbers.
- `posts.csv`: one row per original post, 24h and 7d snapshots.
- `outreach.csv`: one row per drafted reply into someone else's thread.
- `followers.csv`: one row per account pull.
- `score.py`: ingests X API pulls, prints the weekly scorecard. Stdlib Python 3.
- `pulls/`: raw JSON for each pull, kept so any number can be re-checked.
- `LOG.md`, `LEARNINGS.md`, `TIMING.md`, `EXPERIMENTS.md`: running history.

## 1. North star

**Tactics-player replies per week**: replies on our posts and on our outreach replies from accounts that talk about the board (a move, a unit, a faction, another tactics game), not the token. Counted by hand in `tactics_replies`, because only a person can judge it reliably.

Secondary (the real goal per STRATEGY.md): **plays started from X**. Not visible via the public API. It becomes measurable only once the site tags `/play` visits with `?utm_source=x&utm_content=<post id>` and the analytics count is pasted into `notes` weekly. Until then write "not visible".

## 2. Leading indicators

| Indicator | Definition | Source |
|---|---|---|
| Views | `impression_count` | API |
| Engagement rate (ER) | (likes + **outside** replies + reposts + quotes) / views | API, computed (self-replies excluded) |
| Reply rate | outside replies / views | API, computed |
| Follower delta | followers now minus followers 7 days ago | `followers.csv` |
| Tactics vs token replies | `tactics_replies` vs `token_replies` | human tag |
| Outreach reach | views + likes on our replies in others' threads | API on `our_reply_url` |

Bookmarks are returned by the API and can go in `notes`, but they do not count toward ER.

## 3. Per-post measurement

- **24h snapshot**: first pull 20 to 48h after posting fills `*_24h`. This is the comparison number for formats and slots.
- **7d snapshot**: pull 6 to 10 days after fills `*_7d`. Shows long tail, Turn Based Thursday pickups.
- `age_h_*` records the actual age at the pull, so the snapshot is honest about timing.
- Our own self-replies (the link / follow-up reply under each post) are excluded from posts.csv as rows.
- **`replies_24h` / `replies_7d` are outside-only.** `score.py ingest` subtracts our own self-replies from X's `reply_count` before writing those columns and before computing `er_*`. Self-replies are detected from the pull JSON (`in_reply_to_user_id` == our id + `referenced_tweets` type `replied_to`), with a fallback to an `Own-reply https://...` note on the parent row when the pull no longer includes that reply. Changed 2026-10-18 so ER is not inflated as ~1/views by our link follow-ups.
- Human fills at posting time: `format_tag`, `hypothesis`. `slot` is auto-set from posted time PT (morning 5-11, midday 11-15, afternoon 15-19, evening 19-24, night 0-5).
- Human or xcom fills after reading replies: `tactics_replies`, `token_replies`.

Format tags: `decision`, `still`, `clip`, `faction`, `ttt` (Turn Based Thursday), `astra`, `monday`, `pin`. Add new tags in EXPERIMENTS.md first.

## 4. Reply outreach

xcom adds a row to `outreach.csv` for each draft (`target_url`, `target_account`, `drafted_at`). The human sets `posted` = y/n and pastes `our_reply_url`. The daily check reads that reply's public metrics into `views`, `likes`, `replies`. `profile_effect` = follower delta on the day if a reply clearly drove it, else "not visible". Profile visits are not visible.

## 5. Cadence

- Daily, 9:37 AM PT: pull account + last 10 days of posts, save JSON to `pulls/YYYY-MM-DD.json`, run `python3 score.py ingest pulls/YYYY-MM-DD.json`, update outreach metrics, append to LOG.md.
- Monday: `python3 score.py scorecard --week-ending <Sunday>` goes into LOG.md, then the Monday numbers questions from XCOM.md are answered under it, and LEARNINGS.md is updated.
- Week 1 (15 to 21 Oct) has no previous week. It becomes the baseline; WoW starts week 2.

## 6. Experiments

One row per experiment in `EXPERIMENTS.md`:

| id | hypothesis | format_tag | slot | posts | start | result | decision |

Rules:
- One variable per experiment (format or slot, not both).
- Minimum 3 posts per arm before deciding. Fewer is "inconclusive", not a result.
- **Keep** if the arm has more tactics replies, or equal tactics replies and ER at least 1.25x the other arm.
- **Drop** if it got zero tactics replies across 3 posts.
- Everything else: run 3 more, then decide. Never decide on views alone.
- Post frequency is not an experiment variable (STRATEGY.md).

## 7. Not visible via public API

Profile visits, link clicks, `/play` visits or plays, follows attributed to a post, who viewed, impressions on other people's threads beyond the reply's own count, demographics. Write "not visible". Never estimate. X Analytics in the account (human login) shows profile visits and link clicks; if the human pastes them into `notes`, mark them "from X Analytics".

## 8. Pull shape for score.py

```json
{"pulled_at": "2026-10-16T16:37:00Z", "test": false,
 "user": <get_users_by_username response, user.fields=public_metrics>,
 "posts": <get_users_posts response, post.fields=public_metrics,created_at,referenced_tweets,in_reply_to_user_id>}
```
