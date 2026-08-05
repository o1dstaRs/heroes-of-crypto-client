# HoC Forge

`HoC Forge` is the game's display-face alias for carved fantasy headings and controls. Its shapes are based
on the SIL Open Font License release of **Forum Regular** by Denis Masharov and are bundled here under the
same license. The font contains Latin, extended Latin, Cyrillic, numerals and punctuation.

## CSS

The game registers the face globally in `src/ui/style.scss`:

```css
font-family: var(--hoc-font-display);
```

Reusable classes:

```html
<span class="hoc-forge-display">Новая битва</span> <span class="hoc-forge-display hoc-forge-engraved">START</span>
```

## React / MUI Joy

```tsx
import { hocDisplayFontFamily, hocEngravedTextSx } from "./hocTheme";

<Typography sx={{ fontFamily: hocDisplayFontFamily }}>Heroes</Typography>
<Typography sx={hocEngravedTextSx}>ГЕРОИ</Typography>
```

`OFL.txt` contains the font license and attribution terms.
