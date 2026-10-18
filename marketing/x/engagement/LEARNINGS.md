# LEARNINGS

Started 2026-10-14. Baseline week: 15-21 Oct.

## 2026-10-15 (daily)

- Early signal only (no 24h snapshots yet): the story pin is outrunning the morning queue tactics post on views and likes (~36/2 vs ~10/0 at ~13.5h and ~2.7h). First external reply on the pin was a follow-back ask, not a tactics question — north star still 0.
- Formats/slots: too few scored posts to compare; pin = evening story-pin, queue = morning tactics-calendar. Wait for 24h windows (pin eligible ~4:03 PM PT today; queue tomorrow morning).

## 2026-10-16 (daily)

- First 24h windows filled: pin (evening story-pin + image) 50 views / ER 0.06; queue (morning tactics-calendar + still) 16 views / ER 0.0625; origin (midday story-origin, text-only) 20 views / ER 0.10. Absolute reach still favors the pin; ER leader is midday origin (own-link reply inflates ER on queue/origin — pin's reply is external follow-back). North star still 0 tactics replies across all three.
- Lesson: Midday text-only story beat evening pin and morning image tactics on 24h ER, but pin still leads views and no tactics replies yet — keep the three-slot cadence until the north star moves.

## 2026-10-17 (daily)

- Three new 24h windows: Chaos (evening tactics-calendar, text-only) 14 views / ER 0.0714; Edge (morning tactics-calendar, text-only) 14 views / ER 0.0714; board-flash (midday story-devdiary, text-only) 10 views / ER 0.10. Pin still leads views (50 at 24h); midday story posts (origin + board-flash) share the ER lead at 0.10. Life (~16.7h) and Through Shot (~2.7h) still too young. North star still 0 tactics replies / 0 token across all scored posts.
- Lesson: Midday text-only story beat morning and evening text-only tactics on 24h ER again (0.10 vs 0.0714); Chaos and Edge matched each other on views and ER, so slot alone among tactics posts is not differentiating yet. Keep the three-slot cadence until tactics replies appear.

## 2026-10-18 (daily)

- Three new 24h windows: Life (evening tactics-calendar, text-only) 13 views / ER 0.0769; Through Shot (morning story-tactics, approved Tsar Cannon poster) 10 views / ER 0.10; Crowd (midday tactics-calendar, text-only) 9 views / ER 0.1111. Might (~16.7h) and the Sun question (~2.7h) still too young. Pin now 66 views (85.6h), 7d window opens ~Wed 21 Oct evening. North star still 0 tactics replies / 0 token across all nine scored posts.
- What didn't work: the Tsar Cannon poster post (first image post since Thu) did not beat text-only tactics posts on views (10 vs 13–15), so the image alone isn't lifting reach on Saturday morning. Saturday posts were the weakest day so far (9–13 views).
- Lesson: eight of nine scored posts have zero external likes, replies, reposts or quotes; their only "engagement" is our own link-reply, so 24h ER equals 1 / views and ranks low-reach posts highest. The midday ER lead noted on 16–17 Oct is this artifact, not a real format or slot win. Until outside engagement appears, compare posts on views and external replies, and treat ER as uninformative. Applied the same day — see Measurement fix below.

- **Measurement fix (2026-10-18):** `score.py` now subtracts @Heroes0fcrypto's own follow-up replies from `replies_24h` / `replies_7d` and from ER. Existing pulls were re-ingested. Prior daily ER rankings (midday "wins" at 0.10 / 0.1111) were an artifact of counting our own link-reply; corrected outside-reply ER is 0 for every post that only had that self-reply. The pin's 1 reply stays (external follow-back). Until outside engagement appears, compare on views and outside replies; ER is informative only when outside replies or likes exist.
