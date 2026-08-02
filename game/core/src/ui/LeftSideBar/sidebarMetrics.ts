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
    /** Uppercase section headings: Abilities / Buffs / Debuffs / Up next. */
    sectionTitleRem: number;
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
    _load: ISidebarContentLoad = EMPTY_CONTENT_LOAD,
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
    // Section headings are uppercase and widely letter-spaced, so they carry at a smaller size than body
    // text and were previously oversized against the content they label. Derived from the same fontScale
    // as everything else rather than a literal, and clamped so the micro density stays legible.
    const sectionTitleRem = clamp(0.64 * fontScale, 0.54, 0.74);
    const statIconPx = Math.round(19 * fontScale);

    // Tiles stay in a comfortable 26–86px band; the row count follows from the width rather than a fixed
    // "3 per row", which is what used to blow the card up on wide bars and crush it on narrow ones.
    const abilitiesPerRow = clamp(Math.floor(contentWidth / (compact ? 42 : 62)), 3, 8);
    const abilityCell = clamp(
        Math.floor((contentWidth - gapPx * (abilitiesPerRow - 1)) / abilitiesPerRow),
        26,
        roomy ? 86 : 74,
    );
    const effectIcon = clamp(Math.round(abilityCell * 0.62), 20, 42);

    // The card used to reflow around its content: a unit with many buffs pushed the portrait beside the
    // stats and shrank it, so every creature looked different. The layout is now fixed — portrait on top
    // at full width, stats under it — and the variable-length blocks (abilities, buffs, debuffs) scroll
    // inside their own constant-height wells instead of changing the card. `columnize` stays in the
    // contract for callers, permanently false.
    const portraitCap = roomy ? 430 : 340;
    const columnize = false;
    // A fixed three-up grid of equal cells. It used to be derived from the bar width (1–4 columns) and a
    // stat carrying a modifier chip claimed two of them, so the block re-flowed per creature.
    const statColumns = 3;

    const avatarPx = clamp(Math.floor(contentWidth / 2.6), 34, roomy ? 86 : 74);
    const synergyIcon = clamp(Math.round(30 * fontScale), 22, 34);

    // Sized off the bar alone. It used to also depend on the height left for the card, which is what made
    // a heavily buffed unit render a visibly smaller portrait than a plain one.
    const portraitMax = clamp(contentWidth, 72, portraitCap);

    // 15% over the bar-derived fit: Start is the one call to action on the placement screen and was reading
    // as just another control. The factor is applied AFTER the clamp so it lifts the 0.62 ceiling too — that
    // ceiling is what the button actually hits on a roomy bar. The button's own `width: 100%` still stops it
    // overhanging a narrow one, where the extra size lands on its height and label instead.
    const startButtonScale = clamp(contentWidth / START_BUTTON_FRAME_WIDTH, 0.3, 0.62) * 1.15;

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
        sectionTitleRem,
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
