/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { hocColors, hocPanelSx } from "./hocTheme";

/**
 * The look every out-of-fight screen is built on: the obsidian plate, the ember wash over it, and the
 * card that floats on top.
 *
 * Held in one place because these screens are meant to be ONE room seen from different angles. The
 * lobby browser proved what happens otherwise — it was a bare black page with a back button while the
 * arena next door had art, a nav bar and a framed card, and the two read as different applications.
 *
 * The arena additionally tints the wash and the card's border while a match is confirming; that is its
 * own drama and stays there. What lives here is the resting state everything shares.
 */
export const arenaBackgroundUrl = new URL(
    "../../images/pick_phase_obsidian_background.webp",
    import.meta.url,
).toString();

/** Full-bleed and scrollable, so a short page still fills the window with the plate rather than black. */
export const arenaScreenSx = {
    position: "fixed",
    inset: 0,
    overflowY: "auto",
    bgcolor: "#050504",
    color: hocColors.parchment,
    backgroundImage: `url(${arenaBackgroundUrl})`,
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
} as const;

/** Two embers and a vignette, laid over the plate to keep text off the busiest part of the art. */
export const ARENA_IDLE_WASH =
    "radial-gradient(circle at 28% 35%, rgba(255,143,0,0.1), transparent 31%), " +
    "radial-gradient(circle at 88% 8%, rgba(220,177,88,0.07), transparent 24%), " +
    "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.45))";

/** The wash as its own layer: fixed, so it does not slide up the art as the page scrolls. */
export const arenaWashSx = {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    background: ARENA_IDLE_WASH,
} as const;

/** The column the nav bar and the card share, so the two line up down both edges. */
export const ARENA_COLUMN_WIDTH = "min(1040px, calc(100% - 32px))";

/** The floating panel a screen's content sits in. */
export const arenaCardSx = {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "10px",
    ...hocPanelSx,
    bgcolor: "rgba(12,8,5,0.91)",
    borderColor: "rgba(255,143,0,0.3)",
    boxShadow: "0 28px 80px rgba(0,0,0,0.52)",
    backdropFilter: "blur(16px)",
} as const;

/** Its header: a lit band across the top, ruled off from the body. */
export const arenaCardHeaderSx = {
    position: "relative",
    overflow: "hidden",
    px: { xs: 2.25, sm: 4, md: 5 },
    py: { xs: 2.5, md: 3 },
    borderBottom: "1px solid rgba(239,228,204,0.09)",
    background: "linear-gradient(112deg, rgba(255,143,0,0.12), rgba(220,177,88,0.035) 58%, transparent)",
} as const;

export const arenaCardBodySx = {
    px: { xs: 2.25, sm: 4, md: 5 },
    py: { xs: 2.5, md: 3 },
} as const;

/** The small gold line above a card's title — a season, a mode, wherever the player is standing. */
export const arenaEyebrowSx = {
    color: hocColors.gold,
    fontWeight: 800,
    fontSize: { xs: "0.68rem", sm: "0.75rem" },
    lineHeight: 1.5,
    letterSpacing: { xs: "0.09em", sm: "0.13em" },
    textTransform: "uppercase",
    mb: 1.1,
} as const;

/** The card's title. */
export const arenaTitleSx = {
    maxWidth: 700,
    color: hocColors.parchment,
    fontSize: { xs: "2rem", sm: "2.45rem", md: "2.75rem" },
    lineHeight: 1.02,
    letterSpacing: "-0.035em",
} as const;

/** A reading beside the title — a count, a state, a price. Mirrors the arena's "online" badge. */
export const arenaBadgeSx = {
    minHeight: 38,
    px: 1.15,
    borderRadius: "10px",
    color: hocColors.parchment,
    bgcolor: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(220,177,88,0.3)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
} as const;
