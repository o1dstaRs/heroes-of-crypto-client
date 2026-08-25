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

import { legacyBattleSidebarWidth } from "../../pixi/boardFit";

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

/** Preserve gameplay precision to hundredths without adding meaningless trailing zeroes. */
export const formatSidebarStat = (value: number): string => Number(value.toFixed(2)).toString();

/** Keep stat adjustments separate from the effective value, with an explicit sign for increases. */
export const formatSidebarModifier = (delta: number): string =>
    delta ? `${delta > 0 ? "+" : ""}${formatSidebarStat(delta)}` : "";

/** Attack can carry both an additive adjustment and a multiplier; neither should disappear into the total. */
export const formatSidebarAttackModifier = (attackMod: number, attackMultiplier: number): string =>
    [formatSidebarModifier(attackMod), attackMultiplier !== 1 ? `x${formatSidebarStat(attackMultiplier)}` : ""]
        .filter(Boolean)
        .join(" ");

/**
 * The left frame rail is narrow, while the board-facing side has no matching inner ornament. Keep only
 * enough room to clear that rail: the card deliberately grows leftwards and keeps its right edge fixed.
 */
export const sidebarFrameSideInsetPx = (barSize: number): number => clamp(Math.round(barSize * 0.035 * 0.7), 8, 13);

/** The board-facing edge stays where it is; this is the existing small breathing room beside the board. */
export const SIDEBAR_FRAME_RIGHT_INSET_PX = 4;

/** Matches the compact square corner instead of the old full-image top stretch. */
export const sidebarFrameTopInsetPx = (viewportHeight: number): number =>
    clamp(Math.round(viewportHeight * 0.018), 14, 24);

/** Bottom is the same slim mirrored rail as the top; it no longer reserves room for a decorative plinth. */
export const sidebarFrameBottomInsetPx = sidebarFrameTopInsetPx;

/** The clean right-hand rail has no large caps or bottom plinth, so its content may sit closer to the edge. */
export const sidebarPlainFrameSideInsetPx = (barSize: number): number => clamp(Math.round(barSize * 0.045), 10, 20);

export const sidebarPlainFrameVerticalInsetPx = (viewportHeight: number): number =>
    clamp(Math.round(viewportHeight * 0.022), 12, 24);

const densityFor = (barSize: number): SidebarDensity => {
    if (barSize < 200) return "micro";
    if (barSize < 300) return "narrow";
    if (barSize < 420) return "regular";
    return "wide";
};

// Native size of the start-button atlas frame — the scale is derived from it so the button spans the bar
// without overhanging it.
const START_BUTTON_FRAME_WIDTH = 432;
// After the first 20% reduction, the command panel needed one more 13% step down.
// Keep the reduction multiplicative so the final plate is 69.6% of its original design size.
const START_BUTTON_SIZE_FACTOR = 0.8 * 0.87;

export function computeSidebarMetrics(
    barSize: number,
    cardHeight: number,
    _load: ISidebarContentLoad = EMPTY_CONTENT_LOAD,
): ISidebarMetrics {
    const density = densityFor(barSize);
    const compact = density === "micro" || density === "narrow";

    const padPx = density === "micro" ? 6 : density === "narrow" ? 10 : 14;
    const gapPx = density === "micro" ? 5 : density === "narrow" ? 7 : 10;
    const contentWidth = Math.max(48, barSize - sidebarFrameSideInsetPx(barSize) - SIDEBAR_FRAME_RIGHT_INSET_PX);

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

    // Derive the fit from the native 432px plate, then keep the whole CTA at the requested reduced size. Its own
    // `width: 100%` remains the final guard on very narrow bars.
    const startButtonScale = clamp(contentWidth / START_BUTTON_FRAME_WIDTH, 0.3, 1) * START_BUTTON_SIZE_FACTOR;

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

/**
 * Preserve the production sidebar's split between responsive layout width and the legacy visual scale.
 * The portrait editor uses this helper too, so its canvas cannot drift from the live battle sidebar.
 */
export function computeBattleSidebarMetrics(
    barSize: number,
    viewportWidth: number,
    viewportHeight: number,
    cardHeight: number,
    load: ISidebarContentLoad = EMPTY_CONTENT_LOAD,
): ISidebarMetrics {
    const layoutMetrics = computeSidebarMetrics(barSize, cardHeight, load);
    const originalBarSize = legacyBattleSidebarWidth(viewportWidth, viewportHeight);
    const originalVisualMetrics = computeSidebarMetrics(originalBarSize, cardHeight, load);

    return {
        ...layoutMetrics,
        density: originalVisualMetrics.density,
        compact: originalVisualMetrics.compact,
        columnize: originalVisualMetrics.columnize,
        padPx: originalVisualMetrics.padPx,
        gapPx: originalVisualMetrics.gapPx,
        fontScale: originalVisualMetrics.fontScale,
        statColumns: originalVisualMetrics.statColumns,
        statIconPx: originalVisualMetrics.statIconPx,
        statFontRem: originalVisualMetrics.statFontRem,
        sectionTitleRem: originalVisualMetrics.sectionTitleRem,
        abilityCell: originalVisualMetrics.abilityCell,
        effectIcon: originalVisualMetrics.effectIcon,
        avatarPx: originalVisualMetrics.avatarPx,
        synergyIcon: originalVisualMetrics.synergyIcon,
        portraitMax: originalVisualMetrics.portraitMax,
        startButtonScale: originalVisualMetrics.startButtonScale,
    };
}

export const SidebarMetricsContext = createContext<ISidebarMetrics>(computeSidebarMetrics(280, 640));

export const useSidebarMetrics = (): ISidebarMetrics => useContext(SidebarMetricsContext);
