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

## 2026-10-24 (daily)

- Two new 24h windows (outside-only replies): live-aim dev-diary (Thu evening story-devdiary, player-facing v0.1.7 feature) 13 views / 0 likes / ER 0; Water Shield fire dev-diary (Fri morning story-devdiary, player-facing rule change on a named unit) 13 views / 0 likes / ER 0. 7d: Through Shot 10, crowd 9, Might 17 (13 at 24h), Sun 18 question 15 (14). Followers 92 (unchanged vs 23 Oct, +2 vs baseline 90). Tactics replies 0, token replies 0; only outside reply on any post is still the pin's follow-back request.
- What didn't work: the "player-facing change on a named unit" combination (Water Shield) did not beat plain dev-diaries: 13 views, no like. Posting stalled: Fri 11:48 missed, Fri 4:48 PM and Sat 6:48 AM blocked by X's phone-number check in the box browser, so tweet_count is still 172 and the account has been silent for ~27h.
- What worked: nothing new; pick-your-side (16 views / 1 like / ER 0.0625) is still this week's best ER and Castling (25 views) the best non-pin reach.
- Lesson: at ~13 views per post, single-post format tweaks (named unit, player-facing) don't move ER measurably; the account needs reach first (outreach replies, the still-empty outreach.csv) before format tests can be read. A posting outage costs more than any format choice, so clearing the X phone check is the top priority. Proposal for Stepan, not an edit.

## 2026-10-25 (daily)

- No new 24h windows because of the posting outage (5 slots missed Fri 23 to Sat 24). 7d snapshots for the Sun 18 posts and the Mon 19 question: Nature 18, Sun 18 question 15, plan unit 12, wounded-stack question 10 views, all 0 outside engagement, and each within 0 to 1 view of its 24h number. Followers 92 (flat, +1 over the week). Tactics replies 0, token replies 0; mentions since 23 Oct returned 0.
- What didn't work: plain tactics and question posts have no long tail at all; 7d reach equals 24h reach. The outage meant a full day with no posts and the make-up post went out at 10 PM, when it has 9 views at ~12h.
- What worked: Castling kept growing (25 to 28 views), the only non-pin post still adding views after day one. Pick-your-side (16 views / 1 like / ER 0.0625) stays the week's best ER.
- Lesson: posts that name units and admit an error (Castling) keep collecting views after day one where plain lines stop; but at ~10 to 18 views per post, nothing has earned an outside reply in 11 days, so reach (outreach replies, still none posted) remains the blocker. Proposal for Stepan, not an edit.

## 2026-10-26 (weekly)

Weekly X research refresh (19–26 Oct 2026 PT). Read-only. About 27 public X API reads. Full report: research/2026-10-26-weekly.md (+ .html).

### Market findings

- Case studies: @Lavapotion's best was again video (swamp march 107 likes / 4,714 views https://x.com/Lavapotion/status/2113279271099597273), 3x to 4x its photo and link posts. @OverhypeStudios posted no originals since 15 Oct. @TeamWoodGames still dormant.
- Small accounts broke out on format, not size: @SynthWave6666 (1,554, +14% in a week) character color-study + either/or question 2,483 / 16,620 views https://x.com/SynthWave6666/status/2112729249354248498 (their text-only wishlist asks got 25–31 likes); @WickedNightGame (1,940) combat pixel animation 654 / 17,074 https://x.com/WickedNightGame/status/2113993752394264762; @NextaleGames (1,228) "It's not Triangle Strategy, it's not FFT A2…" comparison video 199 / 6,174 https://x.com/NextaleGames/status/2112574563124920496, 10x their normal reach.
- @Blindspot_Games hosted #TurnBasedThursday on 22 Oct: 52 replies https://x.com/Blindspot_Games/status/2113238941969330520. The host thread is the best weekly reply venue; @TurnBasedThurs (7,494) names the host on Wednesdays.
- Quiet: @MightMagicGame (last original 15 Oct), @Unfrozen_Studio, @Wartales_Game, @shirogames, @Klukva_Games, @TerraRandoma.
- Events: Next Fest 19–26 Oct (ends 26 Oct 10 AM PT) with an AI-demo-flood backlash; Final Fantasy Resonance launched 22 Oct (turn-based chatter, mostly personal/creator accounts); Culdcept BEGINS on Steam 28 Oct. US trends had no games. Astra + game: 929 posts in ~7 days (broader query than last week; still thin).
- Caution: @AresRPG is pitched by creators as "browser-based, turn-based tactical" with AI agents and a token whitelist, our exact description with a token. Stay out of that conversation.

### Our comparison

- Followers 91 (92 most of the week, 91 on 19 Oct): flat. Pin 116 views / 2 likes. 17 of 21 slots posted (5 lost to X's phone check on 23–24 Oct), all text-only. 2 outside likes (Morale, pick-your-side), 0 outside replies, 0 tactics, 0 token. Castling (midday, named units, admitted error) is the best non-pin post at 29 views and still growing. outreach.csv empty two weeks running; no EXPERIMENTS.md arm has run.
- Lesson: every peer breakout this week had an image or motion, and we posted no media at all after 17 Oct. Text dev-diaries earn the occasional like, but at 10–20 views there is nobody to reply. Reach (outreach + media) is the bottleneck, not slot or wording.

### Proposed changes for Stepan (proposals only, no edits to XCOM.md / CALENDAR.md / IMAGES.md)

1. Outreach: at least one posted outreach reply a day, logged in outreach.csv; first fixed target is the Thu 29 Oct #TurnBasedThursday host thread, with one real board image.
2. Media: (a) a real recorded clip/GIF of one mechanic we already dev-diaried (Castling swap, Through Shot, shrinking board); (b) unit-portrait card + either/or question about that unit (SynthWave shape). Each as a 3-post EXPERIMENTS.md arm vs text-only.
3. Calendar (current one ends 28 Oct): keep 3 slots, no question-only posts, midday = named-unit "we got it wrong" dev-diary, plus one true "If you played Heroes III…" comparison post a week (Nextale shape).
4. Reply targets: prioritize @SynthWave6666, @WickedNightGame, @NextaleGames (board/mechanic posts only) and the weekly #TurnBasedThursday host; skip @AresRPG talk, FF Resonance personal accounts, @Conviction_SRPG non-SRPG promos, @secretdoor_dh giveaways.
5. Profile (open since 14 Oct): drop "(HOCAI)", drop the 🟦, add the final period.
6. Posting runs should ping Stepan right away when X shows a contact-confirmation prompt.

### Routine target list additions

- No new official game/studio accounts above 1,000 followers this week. Rejected: @IdleSloth84_ (40,783, creator), @turnbasedlovers and @ControlledPairs (curators), @solvictusig (226), @yokozunagames (23), @Still_Pulsing (85).
- Priority while active: @SynthWave6666 (1,554), @WickedNightGame (1,940), @NextaleGames (1,228), the weekly #TurnBasedThursday host (this week @Blindspot_Games, 7,433).
- Watch-only source (not a reply target): @TurnBasedThurs (7,494), for the Wednesday host announcement.

## 2026-10-26 daily review

- Worked: nothing new earned an outside reaction. The only ER above 0 among new snapshots is still the Morale "our own guide got it wrong" dev-diary (7d: 10 views, 1 like, ER 0.10); admitted-error posts remain the only text format with likes (Morale, pick-your-side were the two likes).
- Didn't work: the three v0.1.7 patch-note dev-diaries (split-spellbook, Last Fuse, Farsight Quiver) all scored 13–17 views and ER 0 at 24h. "New in v0.1.7: <artifact>" reads like patch notes and draws no reply even with a direct play instruction.
- Followers slipped 92 -> 91. With 0 outside replies in 12 days, this supports Monday's proposals (outreach replies and media) over more text-post wording changes.

## 2026-10-27 daily review

- Worked: Monday's three posts (barrels rule 17, area-shots dev-diary 20, plus Sunday's augment-draft 20 at 24h) were the best set of 24h reach since the Castling day, after moving away from "New in v0.1.7: <artifact>" posts. Today's anti-stall morale rule post has an outside like within 3 hours (8 views), the third text post with a like and the second about morale.
- Didn't work: still 0 outside replies and 0 tactics replies (13 days running); every 24h ER in this batch is 0. Followers flat at 91.
- Lesson: rule posts tied to a concrete board mechanic (barrels, area splash on big bodies, morale-as-movement) reach a bit more than artifact patch notes and morale keeps earning the only likes, but at ~20 views there's still nobody to reply. Reach (outreach replies and media, per the 26 Oct proposals) remains the blocker. Proposal for Stepan, not an edit.

## 2026-10-28 daily review

- Worked: the anti-stall morale rule post (Tue 27, morning) is the best new 24h snapshot: 16 views, 1 outside like, ER 0.0625. Morale is now the topic behind 2 of the 3 outside likes on non-pin posts since 14 Oct (Morale's admitted error and this one; the third is pick-your-side). The pick-your-side dev-diary held its like at 7d (18 views, ER 0.056).
- Didn't work: the two "we got it wrong" dev-diaries from 26–27 Oct (stack-count 14 views, Wandering Mage 19 views) both scored ER 0 at 24h. Admitting an error no longer earns a like on its own; the earlier likes came from Morale's topic, not the framing.
- Still 0 outside replies, 0 tactics replies, 0 token replies (14 days running); 7d tails on 21–22 Oct posts grew only +1 to +2 views. Followers flat at 91.
- Lesson: morale-as-movement is the one topic that keeps drawing a like, so a follow-up morale angle is worth a slot; but at 14–21 views reach, not wording, is still the blocker. Outreach replies and media (26 Oct proposals) remain open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.

## 2026-10-29 daily review

- Worked: the FIRE PIT lava map rule (Tue 27, evening) was the best new 24h snapshot at 18 views, and Castling's 7d reached 30 views, still the best non-pin post. The Water Shield fire-change post (Fri 23) grew 13 -> 19 by 7d, the biggest tail this batch.
- Didn't work: the retaliation rule post (Wed 28, morning) got 9 views at 24h, the lowest since 19 Oct, and no like, even though it was a counterintuitive combat rule. The Tsar Cannon design call got 17 and ER 0. No new post earned a like; 0 outside replies and 0 tactics replies for 15 days running.
- Lesson: topic, not framing, explains the few likes (morale), and a generic combat rule with no named unit or faction draws the weakest reach. Named units and map mechanics hold 17–30 views, but reach is still the blocker; the 26 Oct outreach and media proposals stay open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.

## 2026-10-30 daily review

- Worked: nothing new broke out. The Armageddon clock rule (Wed 28, evening) was the best new 24h snapshot at 15 views; the Satyr Helping Hand named-unit post got 14. Both ER 0.
- Didn't work: the morale-from-movement follow-up (Thu 29, morning) got 9 views and no like, tying the lowest 24h since 19 Oct. The one-topic-draws-likes idea from 28 Oct didn't repeat; the two morning rule posts in a row (retaliation, morale follow-up) both sit at 9 views. 0 outside replies, 0 tactics replies for 16 days running. Followers flat at 91.
- Lesson: morale alone doesn't carry a post; the morning slot has now posted the two lowest 24h numbers this week, while evening and midday posts hold 14–18. With reach at 9–20 views, wording tweaks can't be told apart from noise; the 26 Oct outreach and media proposals stay open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.

## 2026-10-31 daily review

- Worked: the Gravechain cursed-artifact trade-off post (Fri 30, midday) was the best new 24h snapshot at 20 views, matching the top midday numbers this week. Framing an artifact as a cost-vs-payoff choice instead of "New in v0.1.7" held midday reach, but still ER 0.
- Didn't work: the doctrines draft rule (Fri 30, morning make-up) got 12 views and ER 0. 7d tails were flat: Sat 24 make-up 13 -> 14, Sun 25 Last Fuse 17 -> 18.
- 0 outside replies, 0 tactics replies, 0 token replies for 17 days running; no mentions since 29 Oct. Followers flat at 91.
- Lesson: the morning slot has now posted the lowest 24h number three days running (9, 9, 12) while midday holds 14–20, so the morning gap is starting to look like slot, not topic. Keep collecting through next week before proposing a slot move; reach (not wording) is still the blocker and the 26 Oct outreach and media proposals stay open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.

## 2026-11-01 daily review

- Worked: the Quiver of Echoes shooter-army trade-off (Sat 31, evening) reached 26 views at ~17.7h, before its 24h snapshot, the best early number since Castling (30 at 7d). A named-unit payoff (Gargantuan throws three times) on an artifact choice held the most reach this week. The turn-order rule (Fri 30, evening) was the best new 24h snapshot at 15.
- Didn't work: the Angel "we got one wrong" dev-diary (Sat 31, midday) got 9 views at 22.7h, the lowest midday number so far, while the morning turn-clock rule got 13. 7d tails stayed +0 to +2 (Farsight 16 -> 17, augment draft 20 -> 20, barrels 17 -> 19).
- 0 outside replies, 0 tactics replies, 0 token replies for 18 days running; no mentions since 30 Oct. Followers flat at 91.
- Lesson: the "morning is the weak slot" pattern broke the first time midday dipped to 9, so slot differences at 9-26 views are noise; artifact trade-offs with a named unit are the one framing that keeps landing at the top. Reach is still the blocker; the 26 Oct outreach and media proposals stay open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.

## 2026-11-02 (weekly)

Weekly X research refresh (26 Oct – 1 Nov 2026 PT). Read-only. About 15 public X API reads. Full report: research/2026-11-02-weekly.md (+ .html).

### Market findings

- HoMM had a busy week: Songs of Conquest passed 800,000 Steam copies (262 / 16 replies / 9,549 views https://x.com/Lavapotion/status/2115012773394399484) and was bundled with Olden Era (166 / 15 / 7,242 https://x.com/Lavapotion/status/2115393803914019040); @Unfrozen_Studio shipped Olden Era's biggest balance update, with Attack/Defense damage reworked (text-only, 117 / 8 replies / 4,209 https://x.com/Unfrozen_Studio/status/2115868220464742871); "Heroes Never Die" (HoMM meets Vampire Survivors) announced, IGN post 42,236 views https://x.com/IGN/status/2114733911221604505.
- Human-made vs AI went mainstream: a poll gave Steam's human-made games 98.4% of 139K+ votes after Sweeney attacked Steam's AI-disclosure rule (https://x.com/i/trending/2114912575578366022). @vampiretactics' "We value human-made work" was its top post (382 / 9,972 https://x.com/vampiretactics/status/2116849257617789152); its "5,000 wishlists in 24h" drew the most replies (14).
- Motion still wins for small accounts: @SynthWave6666 (1,776, +14% again) face-animation video 2,295 / 26,674 https://x.com/SynthWave6666/status/2116955462428168646, while its "Where would you move?" board video got 27 / 1,173. @WickedNightGame pixel GIF 508 / 11,601 https://x.com/WickedNightGame/status/2115906504175829288.
- #TurnBasedThursday: @Mantis_GamesBE hosted 29 Oct, 40 replies https://x.com/Mantis_GamesBE/status/2115744485652988373. Next thread Thu 5 Nov.
- Keep away: "Agent Dojo" (AI agents in turn-based duels, X news story) and @AresRPG ("turn-based tactics… on-chain… in your browser"). Astra + game: 1,909 posts in ~7 days (929 last week, same query), still thin.
- Quiet: @OverhypeStudios (Kickstarter only), @TeamWoodGames, @MightMagicGame, @Wartales_Game, @Klukva_Games, @Midjiwan, @Blindspot_Games, @StudioDraconis.

### Our comparison

- Followers 91, flat for the third week. Pin 159 views (116 last week). 20 of 21 slots posted (Thu 29 4:48 PM never went out), all text-only. Avg 24h views 14.8 (n=16) vs 14.4 last week. 1 outside like (anti-stall morale), 0 outside replies for 19 days, 0 tactics, 0 token. outreach.csv still empty; no experiment has run.
- Best: Quiver of Echoes 28 views (artifact trade-off with a named unit), Wandering Mage 24, FIRE PIT 23, area shots 21, Gravechain 21. Worst: generic rules with no named unit (morale follow-up 10, retaliation 13, Hourglass 11).
- Slots, 24h avg: midday 16.5 (n=6), evening 15.5 (n=4), morning 12.7 (n=6). Morning has been last two weeks running (13.5 last week). Story/trade-off 16.1 vs rule posts 13.8.
- Lesson: the wording is as good as it's going to get at this reach. Named-unit trade-offs reliably top the week, but averages haven't moved in two weeks. The levers left are outreach (0 posted) and motion (0 posted), and this week's market added two hooks: HoMM battle-math news and the human-made stance (only if Stepan confirms it's true).

### Proposed changes for Stepan (proposals only, no edits to XCOM.md / CALENDAR.md / IMAGES.md)

1. Unblock outreach: Stepan posts one drafted reply a day, or extends permission so xcom posts one text-only outreach reply a day under listed official accounts. Start with the Thu 5 Nov #TurnBasedThursday thread and the @Unfrozen_Studio balance thread.
2. Media: a 3-post EXPERIMENTS.md arm of real recorded gameplay motion (5–10s clip/GIF of a mechanic we've posted about), recorded by Stepan; then a unit-portrait + either/or arm.
3. Calendar: named-unit trade-offs and dev-diaries at midday and evening; drop generic rule posts that name no unit, faction or map; test the morning slot at ~9:30 AM PT for a week; one real-number post a week if Stepan supplies the number.
4. One true post on our damage math while Olden Era's Attack/Defense change is being argued about (no claims about their game).
5. "Made by people" dev-diary only if Stepan confirms it's true, including how Astra/AI tools were or weren't used; otherwise skip the topic.
6. Reply targets: @Unfrozen_Studio balance threads, the #TurnBasedThursday host, @SynthWave6666 (character/board posts), @vampiretactics (milestone/dev posts, not the human-made post), @WickedNightGame. Keep skipping Agent Dojo, @AresRPG, Wielders posts, and Japanese-only Conviction posts.
7. Profile (open since 14 Oct): drop "(HOCAI)", drop the 🟦, add the final period.
8. Reliability: the posting run confirms the post URL in LOG.md within its slot, and makes up a missed post by the next slot.

### Routine target list additions

- Added @LudogramGames (1,238; indie studio, Heroes Never Die + Invokyr). Reply only on hero/army or HoMM-style posts, never survivors-horde clips.
- Not added: @PlayWarSlice (370) and @warhounds_game (100), under floor (watch WarSlice, an Advance Wars-like PvP tactics game); @bedrettin_ortak (personal), @kumasnore (personal artist), @retreauxgames (retro RPG, not tactics); press/aggregators/deals (@nexindie, @NoisyPixelNews, @Keymailer, @danceman, @GGdeals, @IGN, @Wario64); @agentdojo/@AresRPG promoters (Web3).
- Watch-only: @TurnBasedThurs (7,501) for Wednesday's host.

## 2026-11-02 daily engagement review (own posts)
- 24h snapshots: Sat 31 4:58 PM evening Quiver of Echoes 28 views (41.7h), the best 24h reach since Castling; Sun 1 11:59 AM midday Tome of Amplification 19 (21.7h); Sun 1 6:50 AM morning Hourglass rule 11 (26.9h). All ER 0.
- Worked: artifact trade-offs that name a unit (Quiver/Gargantuan 28, Tome/Behemoth 19) out-reach generic rule posts. Since 26 Oct, story-devdiary averages 17.8 views at 24h (n=9) vs tactics-rule 13.5 (n=10).
- Didn't work: rule posts with no named unit in the morning slot (Hourglass 11). Morning averages 12.4 at 24h (n=7) vs midday 16.9 (n=7) and evening 18.0 (n=5).
- Lesson: reach follows named units, not rules. With the v0.1.7 artifacts used up, the next posts should still carry a named unit or faction.
- 7d: Tue 27 anti-stall morale 16 -> 17, still the only post with an outside like this fortnight (ER 0.059). Morale stays the one topic that draws a like.

## 2026-11-03 daily engagement review (own posts)
- 24h snapshots: Sun 1 4:51 PM evening Aegis of the Arcane 11 views (40.9h); Mon 2 6:57 AM morning Rime Charm 14 (26.8h); Mon 2 11:55 AM midday co-op sandbox 14 (21.9h). All ER 0.
- Worked: Rime Charm (named unit: Dryad / Black Dragon) matched midday sandbox reach at 14 from the morning slot, the strongest morning 24h since anti-stall morale (16). Story/dev-diary still leads tactics-rule since 26 Oct (16.6 vs 13.5 avg views).
- Didn't work: Aegis of the Arcane, an artifact trade-off with no named unit payoff, got only 11 views at 24h — tying Hourglass as the weakest evening/late snapshot this stretch and undercutting the evening-strong pattern (evening avg now 16.8 with Quiver 28 still carrying it).
- 7d: Tue 27 Wandering Mage 19 -> 26 (+7, biggest tail since Mon 19 first-move); FIRE PIT 18 -> 23; anti-stall morale 16 -> 17 (still the only outside like this fortnight, ER 0.0588). Retaliation 9 -> 13.
- Early (not yet 24h): Mon 2 4:53 PM Arachna/Cyclops retune already 28 views + 1 outside like at ~16.9h — on pace with Quiver.
- Lesson: named units still decide reach more than slot. Rime held morning; Aegis without a named unit did not hold evening. Keep putting a unit or faction in every post; the open outreach/media proposals stay the reach levers.
- 0 outside replies, 0 tactics replies, 0 token replies for 20 days running. Followers flat at 91. Yesterday's three Mon 2 slots all posted; comment-reply last checked 8:22 AM PT with nothing to handle.

## 2026-11-04 daily engagement review (own posts)
- 24h snapshots: Mon 2 4:53 PM evening Arachna/Cyclops retune 30 views + 1 outside like / ER 0.0333 (40.8h); Tue 3 6:57 AM morning stack-size 7 (26.7h); Tue 3 11:51 AM midday Griffin Range Null Field 16 (21.8h).
- Worked: Arachna/Cyclops named-unit retune was the best new 24h since Quiver (28) and the second outside like this fortnight (after anti-stall morale). Named-unit number trade-offs still top the board.
- Didn't work: morning stack-size (Peasant 200 vs Black Dragon 1), despite naming units, got only 7 views — the lowest 24h since 19 Oct and the weakest morning in the Oct 26+ window. Named units do not reliably save the morning slot.
- 7d: Wed 28 Tsar Cannon 17 -> 18; Armageddon 15 -> 17; Thu 29 morale-from-movement 9 -> 10; retaliation age refresh 13 at 171.7h (was 147.8h). Tails stay +1 to +2.
- Early (not yet 24h): Tue 3 4:55 PM Unicorn One in the Field 11 views at ~16.7h; today's 6:55 AM Black Dragon/Angel 2x2 7 views at ~2.7h.
- Lesson: named-unit retunes still earn the rare like and top reach, but a named-unit morning post can still land at 7 views — slot + format both matter, and reach (not wording) remains the blocker. Open outreach/media proposals stay the levers.
- 0 outside replies, 0 tactics replies, 0 token replies for 21 days running. Followers flat at 91. Yesterday's three Tue 3 slots all posted; comment-reply last checked 8:18 AM PT with nothing to handle.

## 2026-11-05 daily engagement review (own posts)
- 24h snapshots: Tue 3 4:55 PM evening Unicorn One in the Field 13 views / ER 0 (40.8h, late snapshot); Wed 4 6:55 AM morning Black Dragon/Angel 2x2 12 / ER 0 (26.8h); Wed 4 11:53 AM midday Mantis Paralysis 14 / ER 0 (21.9h).
- 7d: Thu 29 Satyr Helping Hand 16 (166.8h); Fri 30 doctrines make-up 12 -> 14 (147.9h); Thu 29 morale-from-movement age refresh 10 at 171.9h.
- Worked: nothing stood out; Mantis (14) was the best new 24h, and Griffin kept growing (16 at 24h -> 19 now).
- Didn't work: six named-unit ability posts in a row (stack-size, Griffin, Unicorn, 2x2, Mantis, Hydra so far) averaged ~13 views with no likes. Naming a unit is no longer enough on its own; the two likes this fortnight came from posts with concrete before/after numbers (Arachna/Cyclops retune) or a contested rule (anti-stall morale).
- Lesson: favour posts that carry a real change or number (a retune, a patch before/after) over another single-ability explainer. Reach, not wording, is still the blocker; the outreach and media proposals stay open for Stepan. Proposal only, no edits to XCOM.md / CALENDAR.md / IMAGES.md.
- 0 outside replies, 0 tactics replies, 0 token replies for 22 days running (mentions since 2 Nov = 0; every reply_count 1 is our own follow-up; quotes 0). Followers flat at 91. Yesterday's three Wed 4 slots all posted; comment-reply last checked 8:25 AM PT with nothing to handle.

## 2026-11-06 daily engagement review (own posts)
- 24h snapshots: Wed 4 4:55 PM evening Hydra Lightning Spin 15 views / ER 0 (40.9h, late snapshot); Thu 5 7:01 AM morning Pikeman Aggr 8 / ER 0 (26.8h); Thu 5 11:52 AM midday Medusa Petrifying Gaze 5 / ER 0 (21.9h).
- 7d: Sat 31 ranked turn clock 13 -> 18 (147.9h); Fri 30 turn-order 15 -> 17 (161.9h); Fri 30 Gravechain 20 -> 22 (167.0h); Fri 30 doctrines make-up age refresh 14 -> 15 (171.9h).
- Worked: evening Hydra (15) was the only new 24h above the recent named-unit average; evening still leads morning on pure reach.
- Didn't work: Medusa at 5 views is the worst 24h since 19 Oct (ties nothing recent — stack-size's 7 was the previous floor). Midday named-unit explainers are no longer safe; Pikeman morning at 8 continues the weak-morning pattern.
- Lesson: a single-ability explainer can now land at 5–8 views even with a named unit. Prefer posts that carry a concrete change, number trade-off, or contested rule (Arachna/Cyclops retune and anti-stall morale still hold the only outside likes this fortnight). Reach remains the blocker; outreach/media proposals stay open for Stepan. Proposal only — no edits to XCOM.md / CALENDAR.md / IMAGES.md.
- 0 outside replies, 0 tactics replies, 0 token replies for 23 days running (comment-reply last checked 8:28 AM PT; every reply_count 1 is our own follow-up; quotes 0). Followers 90 (−1 vs 2026-11-05, flat vs baseline 90). Yesterday's three Thu 5 slots all posted; today's 6:48 AM Manticore also posted. Behemoth (~16.9h) still outside the 24h window.
