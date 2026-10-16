# Heroes of Crypto — X campaign

Account: [@Heroes0fcrypto](https://x.com/Heroes0fcrypto). Site: [heroesofcrypto.io](https://heroesofcrypto.io). Play: [heroesofcrypto.io/play](https://heroesofcrypto.io/play).

Checked 14 Oct 2026. The account still has the treasury bio ("The first Bitcoin Treasury on @base, powered by $HOCAI token"), about 90 followers, and no game post since the 6 Dec 2025 pool launch. Those followers came for a token. This campaign does not talk to them.

## Who it is for

People who already play a tactics game and will argue about a move: Heroes of Might and Magic, Disciples, King's Bounty, Into the Breach. English only. The Russian site stays off this account.

The offer is one board decision. The game is free in the browser, no install, no wallet to start. Ranked or the sandbox. Rewards are a reply, and only when someone asked.

## What a post is

One decision a player can use in the next fight. Not lore, not a ticker, not a countdown, not "follow and repost."

The only post that contains `heroesofcrypto.io` in the body is the pin. Every other post puts the link in the first reply.

No `$HOCAI`, contract address, Dexscreener, "to the moon," airdrop, or giveaway. No automated posting. Grok Bot drafts. A person posts.

## Cadence

One original post a day, including weekends, for 14 days starting 15 Oct 2026. The pin goes up before that post. If there is no real screenshot or 6–15s clip for a fight day, post the still named in the calendar. Do not invent a clip.

Replies are the growth channel. Up to three a day, only where a tactics player would actually answer. Zero is an acceptable day.

Monday is a review, not an extra hype post. It decides which of the three formats to repeat. It does not recommend posting more.

## Three formats

1. **Decision.** The daily post. One rule from the real game: the queue, the shrinking edge, a faction's actual job, or a unit ability that is in the game data.
2. **Reply.** A short answer in someone else's tactics thread. The game is mentioned only if it belongs in that answer. The link is optional and goes last.
3. **Monday note.** Public numbers for the last seven days, which post earned a reply from a player, which format to repeat. Internal unless the human turns one real observation into the Monday post already on the calendar.

## What we count

Plays started, not likes. Until that number is wired to X, the Monday note uses only what it can see: public views, replies, and profile visits or link clicks if X analytics is open. If a number is missing, say it is missing. Do not estimate.

After 14 days, continue the daily post only if at least one of these happened: a reply from someone talking about the board, a profile visit that was not a token reply, or a play the human can attribute to the account. If none did, change the pin and the first line. Do not go back to token posts to "revive" the old audience.

## Voice

Short. Declarative. A player talking to a player. No hashtags, no emoji, no thread of twelve. The article already said it better; the post is the one sentence the article earned.

Facts that are allowed because they are on the site or in the unit data:

- Turn-based tactics in the browser. No download. No wallet gate. Ranked and sandbox beta.
- Four factions on the public roster: Chaos, Life, Might, Nature.
- The outer cells go away. The queue is the turn order. Morale can surge or stall a unit.
- Tsar Cannon is ranged, has Through Shot (the shot continues through targets) and No Melee.
- A19 is the production AI. It does not learn during a match. It searches a bounded set of legal moves on the real rules.

Do not invent win rates, player counts, damage numbers, or "the meta."

## Setup before the first post

Do this on 14 Oct, before any of the calendar posts.

1. Bio: `Turn-based tactics in the browser. One fight, then the map shrinks. No install. No wallet to start.`
2. Banner and avatar: game art only. Pin image is `site/public/assets/images/preview_game.webp`. Do not use `pool_lock_event_upd.webp`, `rocket.webp`, or `its_coming.webp`.
3. Pin the post in `CALENDAR.md` under "Pin". It is the only post with the URL in the body.
4. In Grok Bot, set the timezone to America/Los_Angeles. Create the three bots in `BOTS.md`. Leave routines off until the first Scout draft and the first Editor draft are both ones you would actually post.

## Bots

| Bot    | When                                            | Delivers                                            | Never                                              |
| ------ | ----------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| Scout  | Weekdays 08:00, only after you liked one draft  | At most five reply drafts, or an explicit empty day | Posts, follows, likes, token threads               |
| Editor | Every day 08:05, only after you liked one draft | That day's calendar post, cleaned, plus the reply   | Posts, adds a ticker, moves the link into the body |
| Monday | Mondays 08:10, only after the pin is up         | Seven-day numbers and one keep-or-drop decision     | Tells you to post more, invents analytics          |

Routines must sit at least five minutes apart. They report in the bot chat. Publishing stays behind you.
