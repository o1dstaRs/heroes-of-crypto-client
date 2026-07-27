/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { createContext, useContext } from "react";

/**
 * The sidebar fills whatever gap is left between the screen edge and the square board, so its width is
 * dictated by the screen and swings by a factor of six: ~128px on 1024x768, ~300px on a 1366x768 laptop,
 * ~420px on 1080p and ~740px on a 2560x1080 ultrawide. Nothing inside may therefore carry a hard-coded
 * pixel size — a 206px start button or an 84px queue avatar simply falls off the narrow end.
 *
 * This module is the single place that turns (bar width, available height) into every number the panels
 * need, so the whole sidebar shrinks and grows as one system instead of each component guessing.
 */

export type SidebarDensity = "micro" | "narrow" | "regular" | "wide";

/** How much the selected unit actually has to show — it decides whether a full-width portrait still fits. */
export interface ISidebarContentLoad {
    abilities: number;
    buffs: number;
    debuffs: number;
}

export const EMPTY_CONTENT_LOAD: ISidebarContentLoad = { abilities: 0, buffs: 0, debuffs: 0 };

export interface ISidebarMetrics {
    /** Full sidebar width in px. */
    barSize: number;
    /** Width actually usable by content (bar minus its horizontal padding). */
    contentWidth: number;
    /** Height available to the unit card, i.e. what is left after the pinned blocks. */
    cardHeight: number;
    density: SidebarDensity;
    /** True on the two narrow tiers, where paddings collapse and type steps down. */
    compact: boolean;
    /** Portrait and stats sit side by side instead of stacking. */
    columnize: boolean;
    /** Sidebar padding in px (also used as the gap between the stacked blocks). */
    padPx: number;
    gapPx: number;
    /** Multiplier applied to every text size in the sidebar. */
    fontScale: number;
    /** Number of stat columns that fit next to (or under) the portrait. */
    statColumns: number;
    statIconPx: number;
    statFontRem: number;
    /** Edge length of one ability tile, and how many fit per row. */
    abilityCell: number;
    abilitiesPerRow: number;
    /** Edge length of a buff/debuff icon. */
    effectIcon: number;
    /** Up-next queue avatar (the leading unit gets `avatarPx * 1.16`). */
    avatarPx: number;
    synergyIcon: number;
    /** Ceiling for the unit portrait's height; the card shrinks it further when space is short. */
    portraitMax: number;
    /** Start-button scale, so the "Start" art never overhangs a narrow bar. */
    startButtonScale: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const densityFor = (barSize: number): SidebarDensity => {
    if (barSize < 200) return "micro";
    if (barSize < 300) return "narrow";
    if (barSize < 420) return "regular";
    return "wide";
};

// Native size of the start-button atlas frame — the scale is derived from it so the button spans the bar
// without overhanging it.
const START_BUTTON_FRAME_WIDTH = 344;

export function computeSidebarMetrics(
    barSize: number,
    cardHeight: number,
    load: ISidebarContentLoad = EMPTY_CONTENT_LOAD,
): ISidebarMetrics {
    const density = densityFor(barSize);
    const compact = density === "micro" || density === "narrow";

    const padPx = density === "micro" ? 6 : density === "narrow" ? 10 : 14;
    const gapPx = density === "micro" ? 5 : density === "narrow" ? 7 : 10;
    const contentWidth = Math.max(48, barSize - padPx * 2);

    // Past ~620px of bar (a 3440x1440 ultrawide leaves 1000) the panel starts looking sparse at default
    // sizes, so text and art scale up a notch instead of floating in the middle of a huge column.
    const roomy = barSize >= 620;
    const fontScale = density === "micro" ? 0.85 : density === "narrow" ? 0.93 : roomy ? 1.12 : 1;
    const statFontRem = 0.75 * fontScale;
    const statIconPx = Math.round(19 * fontScale);

    // "812/1000" plus its modifier chip is the widest stat row; keep that as the column floor.
    const statMinWidth = 92 * fontScale;
    const statColumnsFor = (width: number) => clamp(Math.floor(width / statMinWidth), 1, 4);

    // Tiles stay in a comfortable 26–86px band; the row count follows from the width rather than a fixed
    // "3 per row", which is what used to blow the card up on wide bars and crush it on narrow ones.
    const abilitiesPerRow = clamp(Math.floor(contentWidth / (compact ? 42 : 62)), 3, 8);
    const abilityCell = clamp(
        Math.floor((contentWidth - gapPx * (abilitiesPerRow - 1)) / abilitiesPerRow),
        26,
        roomy ? 86 : 74,
    );
    const effectIcon = clamp(Math.round(abilityCell * 0.62), 20, 42);

    // Whether the portrait sits beside the stats or above them is a question of the space that is left,
    // not of the screen's aspect ratio. A full-width portrait costs as much height as the bar is wide, so
    // it is only taken when the stats, abilities and effects underneath still fit — otherwise the whole
    // card would have to be scaled down, and crisp numbers beat a big picture. That makes a 1366x768
    // laptop and an ultrawide put the stats beside the portrait, while 1080p and 1440p stack them.
    // Narrow bars always stack: a 116px-wide bar cannot split into a portrait and a readable stat column.
    const portraitCap = roomy ? 430 : 340;
    const statRowHeight = Math.round(22 * fontScale) + 4;
    // Twelve stats, plus a row's worth of slack for the modifier rows that claim two columns.
    const stackedStatRows = Math.ceil(12 / statColumnsFor(contentWidth)) + 1;
    const abilityRows = Math.ceil(load.abilities / abilitiesPerRow);
    const effectBlocks = (load.buffs > 0 ? 1 : 0) + (load.debuffs > 0 ? 1 : 0);
    const stackedPortrait = Math.min(contentWidth, cardHeight * 0.5, portraitCap);
    const stackedHeight =
        stackedPortrait +
        34 +
        stackedStatRows * statRowHeight +
        (abilityRows > 0 ? 20 + abilityRows * (abilityCell + gapPx) : 0) +
        effectBlocks * (18 + effectIcon + gapPx);

    // The 6% tolerance buys the big portrait for the price of a shrink nobody can see; anything worse
    // than that and the stats move alongside instead.
    const columnize = contentWidth >= 200 && stackedHeight > cardHeight * 1.06;
    const statsWidth = columnize ? Math.floor(contentWidth * 0.55) - gapPx : contentWidth;
    const statColumns = statColumnsFor(statsWidth);

    const avatarPx = clamp(Math.floor(contentWidth / 2.6), 34, roomy ? 86 : 74);
    const synergyIcon = clamp(Math.round(30 * fontScale), 22, 34);

    // The portrait is the one block that can give space back, so it is capped by the height actually left
    // for the card rather than by its own width — and by `portraitCap`, which keeps it a portrait rather
    // than a poster on the tallest screens.
    const portraitMax = clamp(Math.min(cardHeight * 0.5, contentWidth * (columnize ? 0.52 : 1)), 72, portraitCap);

    const startButtonScale = clamp(contentWidth / START_BUTTON_FRAME_WIDTH, 0.3, 0.62);

    return {
        barSize,
        contentWidth,
        cardHeight,
        density,
        compact,
        columnize,
        padPx,
        gapPx,
        fontScale,
        statColumns,
        statIconPx,
        statFontRem,
        abilityCell,
        abilitiesPerRow,
        effectIcon,
        avatarPx,
        synergyIcon,
        portraitMax,
        startButtonScale,
    };
}

export const SidebarMetricsContext = createContext<ISidebarMetrics>(computeSidebarMetrics(280, 640));

export const useSidebarMetrics = (): ISidebarMetrics => useContext(SidebarMetricsContext);
