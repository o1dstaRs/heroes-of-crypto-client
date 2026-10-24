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

## 2026-10-19 (weekly)

Weekly X research refresh (~13–19 Oct 2026 PT). Read-only. ~26 public X API calls this run.

### Market findings

**Case studies**

- **@TeamWoodGames** (27,306 followers): still silent since May 2025 Danger Pack launch. Skip for outreach.
- **@Lavapotion** (25,299): this week’s best was the Spooktober animated GIF (148 likes / 10 RTs / 6,218 views) https://x.com/Lavapotion/status/2110695513939165407. Fan-art still strong (141 / 5 / 5,353) https://x.com/Lavapotion/status/2109634018060767465. Personality/CM posts still pull replies. Heavy Wielders of the Essence push (survivors-style — skip those posts for outreach per game-accounts.md). Older GIF spike still the account’s ceiling: Korphan animation 555 / 34 / 11,392 https://x.com/Lavapotion/status/2105572070281412965; trolls death-anim GIF 1,736 / 110 / 32,111 https://x.com/Lavapotion/status/2103419414247018687.
- **@OverhypeStudios** (8,273): MENACE balancing update live (163 / 13 / 2,711) https://x.com/OverhypeStudios/status/2110726150129397979; 2026 roadmap (256 / 22 / 5,232) https://x.com/OverhypeStudios/status/2108906660546671057; Golden Joystick Early Access nomination with video (68 / 7 / 1,411) https://x.com/OverhypeStudios/status/2110385168905060586. Format = patch/roadmap still + short announcement. Community screenshot posts remain their historical ceiling (e.g. BLASTER cinematography 2,229 / 143 / 70,460).

**Engage-target sample (active this week)**

- **@MightMagicGame** (5,233): Closed Playtest registration for HoMM3 Remake (76 / 12 / 3,015) https://x.com/MightMagicGame/status/2110641829049696282; community roadmap video (128 / 15 / 26,098) https://x.com/MightMagicGame/status/2107802742198571089.
- **@Midjiwan** (15,459): Polytopia World Championship schedule (14 likes / 105,681 views) https://x.com/Midjiwan/status/2108879639149977969 — views inflated by esports schedule traffic, likes stay low. Finals video 11 / 23,277.
- **@Wartales_Game** (7,779): Xbox DLC trailer pulled replies (44 / 1 / 13 replies / 2,130) https://x.com/Wartales_Game/status/2108560430197043357.
- **@Unfrozen_Studio** (4,996): quiet since 30 Sep Roadmap Patch (138 / 14 / 5,014) https://x.com/Unfrozen_Studio/status/2105271554963542108.
- **@mechabellum** (3,622): tournament result posts only; ~150–500 views, 2–16 likes.
- **@Conviction_SRPG** (6,920): English demo/UI video (18 / 1 / 912) https://x.com/Conviction_SRPG/status/2110968966625784173; Japanese Screenshot Saturday stronger (56 / 6 / 1,737). English-only for our outreach.
- **@Klukva_Games** (18,906): favorite-character poll with 4 stills (10 / 2 / 808) https://x.com/Klukva_Games/status/2111098657156300942.
- **@StudioDraconis** (1,876): Zodiac Legion room-breaching (7 / 2 / 215) https://x.com/StudioDraconis/status/2111819590192001387; AI-tooling threads (low views).
- **@TerraRandoma** (5,433): nearly dormant originals (one sale quote in late Sept).
- **@MeltedGames** (2,208): daily demo clips + one decision question during Next Fest week; ~100–250 views each (e.g. https://x.com/MeltedGames/status/2111455981112643819).
- **@RisingSpire** (2,058): asked if #turnbasedthursday still runs (12 / 1 / 203) https://x.com/RisingSpire/status/2110785501045170206.
- **@SynthWave6666** (1,367): **character portrait spike** — Blightmarch sketch 948 likes / 34 RTs / 7,592 views https://x.com/SynthWave6666/status/2110025402643263953. Follow-up portrait 72 / 998. Strongest mid-tier format this week: one face + one question + wishlist.

**Trends / events**

- Steam Next Fest is live **19–26 Oct 2026 PT** (news: https://x.com/i/trending/2112073536156438884). Worldwide and US trends today were sports/entertainment only — no tactics or Next Fest on the trend list.
- Next Fest + turn-based/tactics search since 12 Oct: many demo posts, almost all accounts under the 1,000-follower floor (VEKARRA, kareinet, MixedMoonGames, FLYINGCATINC, etc.). Curator/press accounts (@ControlledPairs) mentioned Ghost Justice — skip as press/creator.
- Astra / AI-game chatter: ~878 posts in the last ~7 days matching GPT Astra + game keywords (down sharply from the Oct 14 deep-dive’s ~9.5k week). Sample engagement is thin and aimed at AI builders, not tactics players. Do not chase for this account.

### Our comparison (@Heroes0fcrypto)

- Followers **91** (+1 vs baseline 90 on 14 Oct). Following 8. Tweet count 148. Display name still "Heroes Of Crypto (HOCAI)"; bio still ends with 🟦.
- Pin https://x.com/Heroes0fcrypto/status/2110567307013726582 now **73 views / 2 likes / 1 reply** (external follow-back). Still leads views; 7d window opens ~Wed 21 Oct evening PT.
- Scored 24h windows (posts.csv, outside replies only after 18 Oct measurement fix): queue 16v, origin 20v / 1 like, Chaos 14v, Edge 14v, board-flash 10v, Life 13v, Through Shot (image) 10v, Crowd 9v. Corrected outside ER ≈ 0 on every post that only had our own link-reply. Pin outside ER 0.06 from 2 likes + 1 follow-back.
- North star **tactics-player replies: still 0**. Token replies: 0. Outside engagement almost absent except pin likes + 1 follow-back.
- Saturday 17 Oct was the weakest calendar day so far (9–13 views). First image post since the pin (Tsar Cannon poster, Sat morning) did not lift views vs text-only. Question posts started Sun 18 and Mon 19 — too young for 24h scores.
- **outreach.csv is empty** (header only). No drafted or posted outreach replies logged this baseline week.

### Proposed changes for Stepan

Proposals only — do **not** edit XCOM.md, CALENDAR.md, or IMAGES.md without approval.

1. **Profile (still open from 14 Oct):** Rename display name from "Heroes Of Crypto (HOCAI)" to "Heroes Of Crypto"; drop the trailing 🟦 from the bio; add the missing period at the end of the tactics line. Tactics players bounce off the token ticker in the name.
2. **XCOM.md — outreach priority this week:** Prefer drafting replies under (a) @OverhypeStudios MENACE patch/roadmap posts, (b) @MightMagicGame Remake playtest/roadmap when the thread is about the battle screen not the remake trailer hype, (c) @Conviction_SRPG **English** demo posts only, (d) @RisingSpire / @MeltedGames when they post a real board decision, (e) Thursday host threads (@TurnBasedThurs if active). Skip @Lavapotion Wielders posts; skip @TeamWoodGames; skip Next Fest accounts under 1K followers.
3. **CALENDAR.md — no schedule change yet.** Keep the three-slot cadence and the two question posts. Do not drop Saturday or images on views alone (METRICS.md: never decide on views; min 3 posts per experiment arm). After the Sun 18 + Sun 25 question 24h windows fill, decide whether questions earn the first outside tactics reply.
4. **IMAGES.md — optional experiment proposal:** One approved **character/unit portrait poster** (house style, real unit art only) on a tactics line that names a unit ability — inspired by @SynthWave6666’s portrait spike — vs our current board still / gen-card. Tag `gen-card` vs a new `portrait-card` in EXPERIMENTS.md. Still text-only for questions. No fake fight clips.
5. **Do not chase Next Fest or Astra this week.** We have no Steam demo in the fest. Astra volume is thin and the audience is AI builders. One factual Astra post still waits on Stepan confirming how Astra was used (from 14 Oct deep dive).
6. **Measurement:** Keep comparing on views + outside replies until outside engagement appears. ER remains uninformative when the only reply is our own link-reply (fix already in score.py as of 18 Oct).

### Routine target list additions

Already on game-accounts.md (verified this run; no new file edit required unless Stepan wants them flagged “priority”):

- **@SynthWave6666** — 1,367 followers — Blightmarch dark-fantasy SRPG; character-art posts punching far above weight. Already added 19 Oct. Worth prioritizing when they post an English tactics/board question.
- **@MeltedGames** — 2,208 — daily demo + decision questions during Next Fest; good draft targets when the post is about a move, not only a wishlist CTA.
- **@RisingSpire** — 2,058 — classic turn-based; asked about Turn Based Thursday this week.

No new handles above the 1,000-follower floor appeared in this week’s Next Fest / tactics search that aren’t already on the list or excluded (curators/press/sub-1K). Optional: re-check **@TurnBasedThurs** follower count next Monday for Thursday outreach (community host, not a game account — drafts only into their weekly thread).

## 2026-10-19 (daily)

- Three new 24h windows (outside-only replies): Sun 18 HoMM flanking question (morning tactics-question, text-only) 14 views / 0 outside engagement / ER 0; Might (evening tactics-calendar, text-only) 13 views / ER 0; plan unit (Sun midday tactics-calendar, text-only) 11 views / ER 0. Nature (~17h) and the Mon question (~3h, 7 views) still too young; pin 73 views at ~110h, 7d window opens ~Wed 21 Oct 8 PM PT. Followers 91 (unchanged). North star still 0 tactics replies / 0 token across all 12 scored posts.
- What didn't work: the first question post matched the best tactics statements on views (14) but drew no outside reply, so asking alone didn't break the zero. One question post is one arm-post of three; the Mon 19 question is the second, so don't judge the format yet.
- Lesson: across 12 scored posts, slot makes no real difference to reach (morning avg 13.5 views, evening 13.3, midday 12.5), but weekend posts averaged 11.4 views vs 14.5 on Thu/Fri. Reach of ~10–15 views per post is the bottleneck, not format or slot: with so few viewers, no format can earn a tactics reply yet. Outreach replies into bigger threads (outreach.csv still empty) are the lever most likely to move the north star.

## 2026-10-20 (daily)

- Three new 24h windows (outside-only replies): Nature (Sun evening tactics-calendar, text-only) 18 views / ER 0, the best non-pin reach since the origin story; Mon 19 wounded-stack question (morning tactics-question, text-only) 10 views / ER 0; Mon 19 first turn (midday tactics-calendar, text-only) 8 views / ER 0, the lowest yet. Followers 92 (+1 vs 19 Oct, +2 vs baseline 90). North star still 0 tactics replies / 0 token across all 15 scored posts.
- What didn't work: the second question post (Mon 19) also drew no outside reply and only 10 views. Questions are now 2 of 3 arm-posts with zero replies; one more (the next question) decides the arm under the METRICS.md drop rule. Monday posts averaged 9 views despite Steam Next Fest week, so the weekday-beats-weekend reading from 19 Oct does not hold.
- What worked: the Morale dev-diary correction (Mon 4:53 PM) has 1 like at ~17h and its follow-up reply got 1 like too. Across six days, every like we earned came on a story post (pin 2, origin 1, Morale 1); the 11 tactics-calendar lines earned none.
- Lesson: story posts that tell what we built or got wrong are the only format earning outside engagement so far, while plain tactics statements earn views but no reaction. Still too few posts to call it (story n=4 incl. pin vs tactics n=11), but it supports leaning the remaining slots toward dev-diary / story beats once the calendar ends Wed 28. Proposal for Stepan, not an edit.

## 2026-10-21 (daily)

- Three new 24h windows (outside-only replies): Morale dev-diary (Mon evening story-devdiary, text-only) 9 views / 1 like / ER 0.111, the only scored post this week with outside engagement; Tue 27 second attacker (morning tactics-calendar) 13 views / ER 0; Wed 28 No Melee (midday tactics-calendar) 12 views / ER 0. First 7d snapshots: pin 87 views / 2 likes / 1 reply (follow-back) / ER 0.0345 at ~158h (50 views at 24h, so the pin keeps collecting views as the profile's first post); Thu queue post 18 views at 7d vs 16 at 24h, so plain posts have almost no long tail. Followers 92 (unchanged vs 20 Oct, +2 vs baseline 90). North star still 0 tactics replies / 0 token across 18 scored posts.
- What didn't work: tactics-calendar lines are now 0 likes across 13 posts (avg ~12.8 views). The replay-terrain dev-diary (Tue evening) has 6 views / 0 likes at ~17h, weaker than Morale at the same age (9 views / 1 like), so "dev-diary" alone does not guarantee a reaction.
- What worked: every outside like still comes from a story post (pin 2, origin 1, Morale 1). Story-origin's 20 views remains the best non-pin 24h reach.
- Slots (18 scored, pin excluded): evening 13.4 avg views (n=5), morning 12.8 (n=6), midday 11.7 (n=6). The gap is under 2 views, so slot still doesn't matter at this reach. By day: Thu 16.7, Sun 14.3, Fri 12.3, Tue 12.5, Sat 10.7, Mon 9.0 (n=2-3 each, too small to act on).
- Lesson: posts that admit something we got wrong (Morale guide error) earn a reaction where neutral fix stories and tactics statements don't. Proposal for Stepan, not an edit: after the question arm is decided (third question at ~3h, 6 views, no outside reply yet), lean freed slots toward "we got this wrong" dev-diaries.

## 2026-10-22 (daily)

- Three new 24h windows (outside-only replies): replay part two "we got more wrong than we said" (Wed midday story-devdiary) 20 views / ER 0, tied with the origin story for best non-pin 24h reach; replay terrain (Tue evening story-devdiary) 10 views / ER 0; third question post, fastest stack (Wed morning tactics-question) 12 views / ER 0. 7d: origin 23 views / 1 like (20 at 24h), Chaos 15 (14), edge 15 (14), so non-pin posts still add only 1 to 3 views after day one. Followers 92 (flat vs 21 Oct, +2 vs baseline). North star 0 tactics / 0 token across 21 scored posts.
- What didn't work: the question arm is decided. Three question posts (Sun 18, Mon 19, Wed 21) drew 0 outside replies and 0 tactics replies, which meets the METRICS.md drop rule. Plain tactics posts stay at 0 likes across 14 posts.
- What worked: story posts (n=6 scored) average 13.2 views vs 12.6 for tactics (n=14) and hold every outside like we earned except the pin. Today's pick-your-side dev-diary has 1 like at ~3h, the fastest like on a non-pin post so far. Admitting an error (replay part two) earned reach but not a reaction this time.
- Lesson: questions don't get answered at ~12 views per post, so they are dropped; the freed slots should go to story / dev-diary beats, especially player-facing changes and "we got it wrong" stories. Proposal for Stepan, not an edit to XCOM.md or the calendar.

## 2026-10-23 (daily)

- Three new 24h windows (outside-only replies): Castling "we got it wrong" (Thu midday story-devdiary, named units Arachna Queen / Harpy) 25 views / 0 likes / ER 0, the best non-pin 24h reach so far; pick-your-side (Thu morning story-devdiary, player-facing setting) 16 views / 1 like / ER 0.0625, best ER this week; Tsar Cannon free-aim fix (Wed evening story-devdiary) 17 views / ER 0. 7d: edge 15, board-flash 11, Life 14, Through Shot 10 views, all 0 outside engagement. Followers 92 (unchanged). Tactics replies 0, token replies 0; mentions since 22 Oct returned 0.
- What didn't work: still no outside replies on any post, so the north star is 0 for the week. Fix stories without a player-facing change (free-aim guard, replay terrain) earn reach but not a like.
- What worked: story posts (n=9 scored) now average 15.2 views and hold all 3 non-pin likes, vs 12.6 views and 0 likes for tactics (n=14). The three best non-pin 24h reaches (Castling 25, origin 20, replay part two 20) were all midday story posts.
- Lesson: a dev-diary about something the player can see or change (pick-your-side, Morale guide error) earns the like; one naming specific units (Castling) earns the reach. Combining both, a player-facing change on a named unit, is the next thing to test (today's Water Shield post is one). Proposal for Stepan, not an edit.
