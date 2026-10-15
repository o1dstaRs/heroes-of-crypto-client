# Heroes of Crypto: story arc for the first 10 X posts (DRAFT, nothing posted)

Drafted 14 Oct 2026 PT. Every post and reply here is a draft for Stepan to post himself. These rules apply: XCOM.md, marketing/x/STRATEGY.md, IMAGES.md. Stepan's corrections: the game is PvP (we never pitch an AI opponent), the story gets told within the first 10 posts, not every post needs an image, and any image carries its post's idea. Story posts drop $HOCAI, contract addresses, and all price talk. Anything marked [ask Stepan] is unknown and must not be guessed.

## (a) Fact sheet

| Fact | Source |
|---|---|
| Inspiration: Heroes of Might and Magic III & IV. "Too much emphasis on clearing maps, leaving intense head-to-head battles somewhat overlooked." | Whitepaper Introduction, https://heroes-of-crypto.gitbook.io/heroes-of-crypto-ai/the-web3-turn-based-strategy/introduction |
| Original pitch: 1v1 ranked battles in 20–45 minute sessions, with leagues, tournaments, and weekly patches | Whitepaper Introduction |
| Original match flow: a Pick Phase where players alternate picks and bans to build 6 creatures, then a Battle Phase | Whitepaper Introduction |
| 16x16 board | Whitepaper; code `heroes-of-crypto-common/src/constants.ts` GRID_SIZE = 16 |
| 4 factions (Life, Chaos, Nature, Might), with synergies at 2/4/6 units of one faction | Whitepaper |
| 40 creatures across 4 levels (12/12/8/8) | Whitepaper |
| 5 leagues: Watchdog, Warrior, Landlord, Overlord, Emperor | Whitepaper "Ranking system" |
| Planned modes: Ranking Games first, then Weighted Lobbies (ETH stakes), then "AI Prediction Battles" (betting on AI-simulated fights) | Whitepaper "Game mods" |
| Studio name "Old Stars Gaming (o1dstaRs)": "decentralized", self-funded, no angel investors | Whitepaper "The team" |
| Open source on GitHub (o1dstaRs/heroes-of-crypto-client and -common, MIT) | Whitepaper; README |
| Email/password "Web2 option" with no wallet required | Whitepaper |
| First client commit: 12 Jun 2024, Stepan Zolotukhin, "Initial commit" / "Release 0.1.2" | client `git log --reverse` |
| Server first commit: 14 Jun 2024. Common lib split out: 15–16 Jun 2024 | server / client git log |
| Commit counts as of 14 Oct 2026: client 2,343, server 1,005, common 1,563 | `git log --oneline \| wc -l` |
| Committers on the client: Stepan (≈2,166 under two names), Daniil (123), Gregory Skripko (26), dependabot | `git log --format=%an` |
| The shrinking board ("narrowing" laps) has been in the rules since at least 25 Aug 2024. Today it narrows every 3 laps (4 in block mode) and stops at lap 12, when Armageddon starts | common commit "FightProperties added" 2024-08-25; constants.ts |
| Rendering moved to Pixi.js on 4 Nov 2025 ("Buildable transition to Pixi.js"). The box2d dependency was removed on 6 Nov 2025 | client git log |
| Token pool launched 6 Dec 2025, the account's last game-era post | STRATEGY.md |
| Restarted Jun 2026 at full pace: 220 commits in Jun, 536 Jul, 583 Aug, 494 Sep, 146 so far in Oct | client git log by month |
| Today: ranked matchmaking, a sandbox, replays, a doctrine phase plus picks, automatic bans per level [6,6,3,5], up to 8 units per team | client git log Sep–Oct 2026; common src/picks, constants.ts |
| Site guides (Jun–Aug 2026): factions, positioning, reading the board, A19 | site/src/content/blog |
| Real dev-diary fix: 20 Sep 2026 `a2d9b16a` "a board rebuild keeps the narrowing it already drew instead of blinking back to full size". Every narrowing lap flashed one frame of the full board before the cut cells came back | client commit a2d9b16a |
| Other real PvP fixes: "a seat lost to a blip comes back instead of lasting the whole match" (20 Sep), "keep ranked snapshots and animations synchronized through reconnects" (30 Sep), "morale never adds or skips a turn" (site, 24 Sep) | client git log |

## (b) Timeline

- **Jun 2024:** first commits for client (12 Jun), server (14 Jun), and common (16 Jun). Heroes added on 26 Jun.
- **Jul–Dec 2024:** 309 commits. Laps and buffs (Aug), map control in the sandbox (Sep), morale synergy (Nov), picks rendered (Dec). Narrowing is in the rules from Aug 2024.
- **Jan–Oct 2025:** zero client commits. [ask Stepan: what happened in this year?]
- **Nov–Dec 2025:** rebuilt on Pixi.js (55 commits), sandbox refactored (25 Dec). Token pool launched 6 Dec 2025.
- **Jan–May 2026:** zero client commits. [ask Stepan]
- **Jun 2026–now:** restart, with about 2,000 commits in 4.5 months. Combat VFX and fight-finished overlay (21 Jun), site guides (20–22 Jun), UI and pick-screen pass (1 Aug), ranked reconnects and replays (Sep), matchmaking and sandbox polish (Oct). Client version 0.1.6.

## (c) Whitepaper vs code (the code wins)

1. **Mode order.** The whitepaper puts AI Prediction Battles and Weighted Lobbies first, and its tenets even say "eventually Ranked". The code ships ranked PvP and a sandbox. Neither betting mode exists in the client.
2. **"AI" in the name.** The whitepaper calls the AI a betting spectacle. In the code, A19 drives sandbox and co-op decisions and premium advice. Per Stepan, the game is PvP, so we never pitch an AI opponent. XCOM.md and STRATEGY.md still list A19 as an allowed fact, and the calendar's 28 Oct reply mentions the sandbox. [ask Stepan: remove A19 from the allowed facts?]
3. **Draft.** The whitepaper says players alternate picks and bans for 6 creatures. The code has a doctrine phase, then picks by level with automatic bans [6,6,3,5], and up to 8 units per team. [ask Stepan for the exact live roster size]
4. **Factions.** The whitepaper lists 4. The code has art for 6 (adds Death and Order), while the public roster in XCOM.md is 4. Posts say 4. [ask Stepan whether Death and Order are coming]
5. **Creatures.** The whitepaper says 40. The site has 58 portrait files, which may include variants. Posts give no count. [ask Stepan]
6. **Wallet and token rewards.** The whitepaper has per-win token rewards, staking, and NFTs. The code still has wallet plumbing (wagmi/viem), but the campaign and site line is "no wallet to start". [ask Stepan what the wallet does today]
7. **Team.** The whitepaper describes a "decentralized studio" hiring across many roles. The git log shows Stepan writing most of the code, plus Daniil and Gregory Skripko. [ask Stepan for each person's role and who's still on the team]
8. **Session length.** The whitepaper says 20–45 min. Not verified in code, so don't use it. [ask Stepan]
9. **Shrinking board.** Not in the whitepaper. It's in the code (since Aug 2024) and is now the main hook.
10. **Name.** The whitepaper says "Heroes of Crypto AI", while the site and README say "Heroes of Crypto". Use "Heroes of Crypto".

## (d) 10-post plan (7 story posts, 3 tactics posts from the calendar)

Only the pin has the URL in the body. Every other link goes in the reply. No hashtags or emoji.

### 1. Pin, 14–15 Oct: why it exists (STORY)
POST:
> We grew up on Heroes of Might and Magic III and IV. The battles were the best part, and the map kept making us wait for them.
>
> So we built a turn-based PvP game that is only the battle. You face a real player. The queue shows who acts next. The board shrinks every few laps, so nobody hides in a corner.
>
> Free in the browser. No install. No wallet to start.
>
> https://heroesofcrypto.io

REPLY: none.
IMAGE: yes. Use the existing `marketing/x/generated/2026-10-14_pin_who_moves_first_v3.png` only if the headline matches. Better: remake it with the headline "Only the battle." over the Crusader vs Cyclops board with crumbling edges (`units/portraits/cyclops_portrait_full.9c6bea6c.webp` + the Crusader portrait).
Open: is "grew up on" true for the team? The whitepaper says "from our earliest days, captivated by HoMM III & IV."

### 2. Thu 15 Oct: the queue (TACTICS, calendar)
POST: If the unit you want to hit acts before the unit you are sending, the plan is already late. Read the queue before you commit.
REPLY: Why that glance matters more once the map starts shrinking: https://heroesofcrypto.io/news/2026-06-22-how-to-read-the-board/
IMAGE: yes, `site/public/assets/images/preview_game.webp` (real still).

### 3. Fri 16 Oct: origin (STORY)
POST:
> The first commit was 12 June 2024. One repo for the client, one for the server two days later, and a shared rules library so both sides of a match agree on every move.
>
> The idea: take the Heroes battle screen, drop the map, and put two players on it.

REPLY: The code is open source if you want to read the rules instead of trusting them: https://github.com/o1dstaRs/heroes-of-crypto-client
IMAGE: no (text-only), unless Stepan has a 2024 screenshot, in which case this becomes post 6's "then" half. [ask Stepan: who started it, and why then?]

### 4. Sat 17 Oct: the edge (TACTICS, calendar)
POST: Standing on the edge can be the right cell. Staying there is how a shrinking map writes your next turn for you.
REPLY: Five positioning habits, including the edge: https://heroesofcrypto.io/news/2026-06-21-five-positioning-mistakes/
IMAGE: yes, `preview_game.webp`.

### 5. Sun 18 Oct: why PvP and a shrinking board (STORY, replaces the calendar question)
POST:
> Why the board shrinks: in the old battles, the safe move was to wait in a corner and let the other side come to you. Against a real player, that turns into two people waiting.
>
> So the outer cells go away every few laps. Waiting gets more expensive every lap. Somebody has to commit.

REPLY: If you learned flanking in Heroes: do you still open on the edge when you know that edge is going away?
IMAGE: yes. Headline "Somebody has to commit." Two real portraits facing off on a board whose outer ring is fading (poster style per IMAGES.md, not a fake screenshot).
Open: [ask Stepan to confirm that waiting/stalling was the real reason for narrowing]

### 6. Mon 19 Oct: then vs now (STORY)
POST:
> Then and now. Left: [date] build. Right: the same fight today.
>
> Same 16x16 board. Since then we moved rendering to Pixi.js, rebuilt the sandbox, and spent this summer on the part players actually touch.

REPLY: [one line on the biggest thing that changed, from Stepan]
IMAGE: yes. A side-by-side of REAL screenshots only. "Then": [ask Stepan for a 2024 build screenshot; `site/public/assets/images/background_dark_old.webp` may be old art, so check it]. "Now": `preview_game.webp`. No AI-generated "then".

### 7. Tue 20 Oct: dev diary, a real fix (STORY)
POST:
> A bug from last month: every time the board shrank, it flashed back to full size for one frame before the cut cells reappeared.
>
> For one frame, the board lied about the one rule the game is built on. The fix keeps the layers that already shrank and only draws the new ring.

REPLY: Same week we fixed a player dropping for a second and losing their seat for the whole match. They now come back into the fight. PvP is mostly that kind of work.
IMAGE: no (text-only dev diary). Source: commits a2d9b16a (20 Sep 2026) and "a seat lost to a blip comes back" (20 Sep 2026).

### 8. Wed 21 Oct: Through Shot (TACTICS, moved from Sat 24)
POST: Tsar Cannon does not stop on the first stack. Three units in a file is one shot you lined up for them.
REPLY: Through Shot carries the hit through the targets. The fix is the file, not more armor. Play it: https://heroesofcrypto.io/play
IMAGE: yes, the approved `marketing/x/generated/test_tsar_cannon_through_shot.png`, or the portrait `units/portraits/tsar_cannon_portrait_full.cdb58ff9.webp`.

### 9. Thu 22 Oct: the crypto chapter, told straight (STORY)
POST:
> If you followed us before, you came for a token. Our first plan was a game with crypto rewards: win a ranked match, earn a reward, vote on changes.
>
> What we learned: [ask Stepan, e.g. people talked about the token, not the board]. So the game comes first now. You play in the browser with no wallet. The work since June has gone into the fight, not the token.

REPLY: [ask Stepan: does a wallet still do anything today? Say it in one plain line, or leave the reply empty.]
IMAGE: no. Never use token art.
Open: the honest "why" has to come from Stepan. Don't post this with the bracket still in it.

### 10. Fri 23 Oct: what's next (STORY)
POST:
> What's next: ranked matchmaking, a sandbox to test a line before you play it, and replays of every fight are live in beta. [ask Stepan: next 1–2 real items, e.g. new factions, tournaments]
>
> If you want a match against the people building it, reply and we'll set one up.

REPLY: Play: https://heroesofcrypto.io/play
IMAGE: no.
Open: [ask Stepan: are the devs actually available for matches? When?]

The remaining calendar items (Chaos, Life, Might, Nature, crowd, plan unit, wounded stack, first turn, second attacker, No Melee) move to 24 Oct onward, in their original order.

## Open questions for Stepan
1. Who started it and why in June 2024, and what are the roles of Daniil and Gregory Skripko?
2. What happened in 2025 (no commits Jan–Oct) and in early 2026 (no commits Jan–May)?
3. What did the token teach you, and what does a wallet do in the game today?
4. Do you have any real 2024 or 2025 screenshots for then-and-now?
5. Is narrowing's origin really "stop stalling"?
6. Live roster size, factions (4 or 6), creature count?
7. Should A19 and the sandbox come out of XCOM.md, STRATEGY.md, and the calendar?
8. What are the next real roadmap items, and will the devs play matches with followers?
