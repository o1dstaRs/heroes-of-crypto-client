# X image rules (Heroes of Crypto)

Generate X images with the local Codex CLI from the real unit art. These rules sit under XCOM.md: if anything conflicts, XCOM.md wins.

## Hard rules
- Characters come only from real files in `site/public/assets/images/units/` (portraits, `factions/`) or `site/public/assets/images/preview_game.webp`. Composite them pixel-for-pixel. Never redraw, restyle, recolor, extend, or invent a unit. AI generation is for backgrounds only.
- Every image is clearly a poster or art card, never a fake screenshot, fake fight frame, or fake game UI.
- No emoji, hashtags, numbers, win rates, damage, player counts, token art, $HOCAI, or URLs.
- Text: one headline (at most 8 words, taken from the post's idea) and an optional caption naming the unit or faction and its real ability from XCOM.md facts.
- The human approves every image. Nothing gets posted by the bot.

## House style (from the approved test_tsar_cannon_through_shot.png)
- 1600x900 PNG (16:9). Use 1200x1200 only when asked.
- Dark, slightly warm board-grid background with soft light behind the unit.
- The unit takes about the left 55%, uncropped and grounded. Text sits on the right.
- Serif headline in off-white. The key phrase or second line is in muted gold. A thin gold rule, then a small sans-serif caption.
- Keep it clean: no borders, no badges, no logos.

## Command (run from the repo root)
```
codex exec --skip-git-repo-check -s workspace-write "<prompt>" -i "<unit file>" </dev/null
```
- Put the prompt before `-i`, because `-i` takes every argument after it as a file. Pass `</dev/null` so it doesn't wait on stdin.
- Prompt template: "Create a 1600x900 PNG at marketing/x/generated/<YYYY-MM-DD>_<slug>.png. Use the attached real <unit> art (<path>) exactly; do not redraw or alter it. Imagegen only the background (<background idea>), then composite the unit with Pillow. Headline: '<headline>'. Caption: '<caption>'. House style: <paste House style>. No emoji, hashtags, numbers, logos, or fake UI. Only write inside marketing/x/generated/. Verify the unit's opaque pixels are unchanged and report the method."
- It takes about 2 minutes. Codex saves a `.prompt.txt` next to each PNG. Keep both.

## Check before showing the human
1. Open the PNG and look at it: the unit is intact, the text is spelled exactly right, nothing is cropped, and the text is readable at phone size.
2. The image matches that day's post, and the calendar's ATTACH line stays the default unless the human picks the generated one.
3. Log it in `marketing/x/generated/INDEX.md` (date, file, source unit, headline, status: draft/approved/posted). Tag the post's format in `engagement/posts.csv` as `gen-card` so it can be compared with plain stills.

## When and what (added 2026-10-14)
- Not every post needs an image. Use one only when it shows something the text can't: a board situation, a matchup, or a then-and-now. Text-only is fine for questions, opinions, and replies.
- When there is an image, it carries the post's own idea. The headline is the post's key line or its core claim (shortened if needed), and the scene shows that idea, not a generic slogan.
