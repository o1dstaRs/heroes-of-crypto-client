import {
    HoCConstants,
    UnitProperties,
    AttackVals,
    MovementVals,
    TeamVals,
    HoCLib,
    AttackType,
    TeamType,
    ToFactionName,
    SynergyKeysToPower,
} from "@heroesofcrypto/common";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { Box } from "@mui/joy";
import Avatar from "@mui/joy/Avatar";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useCallback, useEffect, useState } from "react";

import { animationAtlases, AnimationUnitName, type AnimationAtlasMeta } from "../../generated/animation_atlases";
import { images, type ImageKey } from "../../generated/image_imports";
import { buildAtlasPingPongTiming } from "../../scenes/atlasAnimationTiming";
import { IVisibleImpact } from "../../scenes/VisibleState";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { CREATURE_PORTRAIT_ASPECT } from "../creaturePortraitVisual";
import {
    DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
    LEFT_SIDEBAR_PORTRAIT_TUNING_EVENT,
    LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY,
    resolveLeftSidebarPortraitTuning,
    type LeftSidebarPortraitTuning,
} from "../leftSidebarPortraitTuning";
import { resolveLeftSidebarPortraitArt } from "../leftSidebarPortraitArt";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { ArrowShieldIcon } from "../svg/arrow_shield";
import { ScrollIcon } from "../svg/scroll";
import { BootIcon } from "../svg/boot";
import { BowIcon } from "../svg/bow";
import { FistIcon } from "../svg/fist";
import { HeartIcon } from "../svg/heart";
import { HourglassIcon } from "../svg/hourglass";
import { LuckIcon } from "../svg/luck";
import { MagicShieldIcon } from "../svg/magic_shield";
import { MoraleIcon } from "../svg/morale";
import { QuiverIcon } from "../svg/quiver";
import { ShieldIcon } from "../svg/shield";
import { ShotRangeIcon } from "../svg/shot_range";
import { SwordIcon } from "../svg/sword";
import { WingIcon } from "../svg/wing";
import Toggler from "../Toggler";
import SynergiesRow from "./SynergiesRow";
import {
    SYNERGY_KEY_TO_IMAGE,
    SYNERGY_NAME_TO_DESCRIPTION,
    isAuraRangeSynergy,
    isFlyArmorSynergy,
} from "./SynergiesConstants";
import { formatSidebarStat, useSidebarMetrics, type ISidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";
import { areUnitStatsPropsEqual, type UnitStatsListItemProps } from "./unitStatsMemo";
import { hocDisplayFontFamily } from "../hocTheme";

interface IAbilityStackProps {
    abilities: IVisibleImpact[];
    teamType: TeamType;
}

const FACTION_SYNERGY_IDS = [1, 2] as const;
const FACTION_SYNERGY_LEVELS = [1, 2, 3] as const;
const FACTION_SYNERGY_LEVEL_TO_UNITS: Record<number, number> = {
    1: 2,
    2: 4,
    3: 6,
};
const FACTION_SYNERGY_LABELS: Record<string, Record<number, string>> = {
    Life: {
        1: "Supply",
        2: "Morale & Luck",
    },
    Chaos: {
        1: "Movement",
        2: "Break",
    },
    Might: {
        1: "Aura Range",
        2: "Ability Power",
    },
    Nature: {
        1: "Board Units",
        2: "Flying Armor",
    },
};

type FactionSynergyItem = Readonly<{
    key: string;
    label: string;
    level: number;
}>;

function getFactionSynergyGroups(factionName: string): FactionSynergyItem[][] {
    return FACTION_SYNERGY_IDS.map((synergyId) =>
        FACTION_SYNERGY_LEVELS.map((level) => {
            const synergyKey = `${factionName}:${synergyId}:${level}`;
            return {
                key: synergyKey,
                label: FACTION_SYNERGY_LABELS[factionName]?.[synergyId] ?? "Synergy",
                level,
            };
        }).filter((synergy) => synergy.key in SYNERGY_KEY_TO_IMAGE),
    ).filter((group) => group.length > 0);
}

function getSynergyTooltip(synergyKey: string, level: number): string {
    return `Level ${level}: ${(
        SYNERGY_NAME_TO_DESCRIPTION[synergyKey as keyof typeof SYNERGY_NAME_TO_DESCRIPTION] || "Unknown Synergy"
    )
        .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[0]?.toString() || "0")
        .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[1]?.toString() || "0")}`;
}

function normalizeUnitNameForAtlas(name?: string | null): AnimationUnitName | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed === "Scavenger") return "Thief" as AnimationUnitName;
    if (trimmed === "Wandering Mage") return "Ash Moth" as AnimationUnitName;
    if (trimmed in animationAtlases) return trimmed as AnimationUnitName;
    return null;
}

function atlasImageKeyFromUnitAndState(unitName: string, state: string): ImageKey | null {
    const base = unitName.toLowerCase().replace(/\s+/g, "_");
    const stateLower = state.toLowerCase();
    const key = `${base}_${stateLower}_atlas` as ImageKey;
    if (key in images) return key;
    return null;
}

type AtlasMeta = AnimationAtlasMeta;

const FULL_BODY_PORTRAIT_UNITS = new Set([
    "Abomination",
    "Angel",
    "Arachna Queen",
    "Arachna Spider",
    "Arbalester",
    "Battle Mage",
    "Behemoth",
    "Beholder",
    "Berserker",
    "Black Dragon",
    "Blacksmith",
    "Centaur",
    "Champion",
    "Crusader",
    "Cyclops",
    "Dryad",
    "Efreet",
    "Elf",
    "Fairy",
    "Frenzied Boar",
    "Gargantuan",
    "Goblin Knight",
    "Griffin",
    "Harpy",
    "Healer",
    "Hydra",
    "Hyena",
    "Leprechaun",
    "Magic Dragon",
    "Manticore",
    "Mantis",
    "Medusa",
    "Mermaid",
    "Monk",
    "Nightmare",
    "Nomad",
    "Ogre Mage",
    "Peasant",
    "Pegasus",
    "Pikeman",
    "Satyr",
    "Squire",
    "Thunderbird",
    "Trent",
    "Troglodyte",
    "Troll",
    "Tsar Cannon",
    "Unicorn",
    "Valkyrie",
    "White Tiger",
    "Wolf",
    "Wolf Rider",
    "Wyvern",
    "Zena",
    "Wandering Mage",
]);

function getDefaultAnimationConfig(unitName?: string | null): { meta: AtlasMeta; imageSrc: string } | null {
    // Sidebar art is a portrait, not a distant full-body board pose. All creatures from the approved
    // full-body refresh have a matching generated chest-to-head 512 image, so keep that crop here while
    // the battlefield uses their authored idle/action atlases.
    if (unitName && FULL_BODY_PORTRAIT_UNITS.has(unitName.trim())) return null;
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const unitStates = animationAtlases[normalized] as unknown as Record<string, AtlasMeta>;
    const stateNames = Object.keys(unitStates);
    if (!stateNames.length) return null;
    const preferredState = stateNames.includes("idle")
        ? "idle"
        : stateNames.includes("default")
          ? "default"
          : stateNames[0];
    const meta = unitStates[preferredState];
    const imageKey = atlasImageKeyFromUnitAndState(normalized, preferredState as string);
    if (!imageKey) return null;
    const imageSrc = images[imageKey];
    return { meta, imageSrc };
}

// Atlas WebP images are large (up to 4096x5120 ≈ 84MB decoded), and decoding on the main thread
// is the main cause of selection jank. We decode them off-thread via HTMLImageElement.decode()
// and cache the result per URL, so the first selection stays responsive and any repeat selection
// is instant/zero-decode. The cache also lets us prefetch the up-next units' atlases in idle time.
const decodedImageCache = new Map<string, Promise<void>>();
// Srcs whose decoded image is already available. Lets the component mount showing the atlas's
// first frame right away (no portrait fallback flash) when the atlas was prefetched/decoded.
const readyAtlasSrcs = new Set<string>();

function warmAtlas(src: string): Promise<void> {
    let existing = decodedImageCache.get(src);
    if (!existing) {
        existing = new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.src = src;
            // decode() resolves once the image is loaded AND decoded off the main thread. Resolve on
            // either outcome so a broken URL still unblocks the UI (fallback stays in place).
            img.decode().then(
                () => resolve(),
                () => resolve(),
            );
        });
        decodedImageCache.set(src, existing);
        existing.then(() => readyAtlasSrcs.add(src));
    }
    return existing;
}

/** True only if the decoded atlas is already in memory — i.e. frame 0 can render this tick. */
function isAtlasReady(src: string): boolean {
    return readyAtlasSrcs.has(src);
}

/** Pre-decode a unit's sidebar animation atlas so selecting it later is instant. */
export function prefetchUnitAtlas(unitName?: string | null): void {
    const config = getDefaultAnimationConfig(unitName);
    if (config) void warmAtlas(config.imageSrc);
}

const AtlasAnimation: React.FC<{
    meta: AtlasMeta;
    src: string;
    onLoaded: () => void;
    /** Ceiling for the rendered portrait; the frame keeps its aspect ratio and centres inside the slot. */
    maxHeight: number;
}> = ({ meta, src, onLoaded, maxHeight }) => {
    const [isImageLoaded, setIsImageLoaded] = React.useState(() => isAtlasReady(src));
    const bgRef = React.useRef<HTMLDivElement | null>(null);

    // Decode off-thread + cache per src: first selection stays responsive, repeats are instant.
    // If the atlas is already decoded (prefetched), start on frame 0 right away — no portrait
    // fallback flash. Otherwise show the portrait until the atlas finishes decoding.
    React.useEffect(() => {
        let cancelled = false;
        setIsImageLoaded(isAtlasReady(src));
        warmAtlas(src).then(() => {
            if (!cancelled) {
                setIsImageLoaded(true);
                onLoaded();
            }
        });
        return () => {
            cancelled = true;
        };
    }, [src, onLoaded]);

    // Derive a stable timing config from meta primitives so the rAF loop isn't restarted on every
    // parent re-render (e.g. HP changes) — only when the actual atlas shape/timing changes. Uses the
    // same shared helper as the board sprite so both views ping-pong identically and stay in phase.
    const timing = React.useMemo(
        () => buildAtlasPingPongTiming(meta),
        [
            meta.frameCount,
            meta.fps,
            meta.totalDurationSec,
            meta.loopDurationMs,
            meta.pauseMs,
            meta.layout?.cols,
            meta.layout?.rows,
        ],
    );

    // Imperative frame stepping: write backgroundPosition straight to the DOM each rAF tick instead
    // of going through React state (no reconciliation 12x/sec).
    React.useEffect(() => {
        const el = bgRef.current;
        if (!el) return;
        const { cols, rows, frameForElapsed } = timing;

        const applyFrame = (frame: number) => {
            const col = frame % cols;
            const row = Math.floor(frame / cols);
            const bgPosX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
            const bgPosY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
            el.style.backgroundPosition = `${bgPosX}% ${bgPosY}%`;
        };

        let raf: number | undefined;
        let lastFrame = -1;
        // Absolute timestamp (not start-relative): the rAF `time` arg shares its origin with the
        // board's performance.now(), so feeding it straight in keeps this portrait phase-locked
        // with the board sprite. A late-mounting sidebar snaps into the board's current phase.
        const animate = (time: number) => {
            const f = frameForElapsed(time);
            if (f !== lastFrame) {
                lastFrame = f;
                applyFrame(f);
            }
            raf = window.requestAnimationFrame(animate);
        };
        raf = window.requestAnimationFrame(animate);
        return () => {
            if (raf !== undefined) window.cancelAnimationFrame(raf);
        };
    }, [timing]);

    const frameWidth = meta.frameWidth ?? 512;
    const frameHeight = meta.frameHeight ?? 512;
    const cols = meta.layout?.cols ?? 1;
    const rows = meta.layout?.rows ?? 1;
    const bgSizeX = cols * 100;
    const bgSizeY = rows * 100;

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                // Height, not width, is the scarce resource in the sidebar: cap the portrait and let the
                // frame's own aspect ratio decide how wide it may be inside that cap.
                maxWidth: `${Math.round(maxHeight * (frameWidth / frameHeight))}px`,
                mx: "auto",
                aspectRatio: `${frameWidth} / ${frameHeight}`,
                overflow: "visible",
            }}
        >
            {/* The atlas's own frame 0 fades straight in from transparent — no static-portrait
                fallback. The portrait and frame 0 are different renders, so crossfading between
                them reads as a "shift"; a single-image fade-in is smooth. The atlas is decoded
                off-thread (and prefetched for up-next units) so this is usually instant. */}
            <Box
                ref={bgRef}
                sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backgroundImage: `url(${src})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${bgSizeX}% ${bgSizeY}%`,
                    backgroundPosition: "0% 0%",
                    imageRendering: "auto",
                    zIndex: 5,
                    opacity: isImageLoaded ? 1 : 0,
                    transform: "translateZ(0)",
                    backfaceVisibility: "hidden",
                    transition: "opacity 180ms ease-out",
                    willChange: "background-position, opacity",
                }}
            />
        </Box>
    );
};

const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType; isAura: boolean }> = ({
    stackPower,
    teamType,
    isAura,
}) => {
    if (stackPower <= 0) return null;
    const isLower = teamType === TeamVals.LOWER;
    const activeColor = isLower
        ? "rgba(0, 210, 0, 1)"
        : teamType === TeamVals.UPPER
          ? "rgba(255, 0, 0, 1)"
          : "rgba(255, 255, 255, 0.85)";
    const emptyColor = "rgba(34, 34, 34, 0.7)";

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: "5%",
                left: "50%",
                transform: "translateX(-50%)",
                width: isAura ? "70%" : "85%", // Narrower for circles to stay inside curves
                height: "12%",
                minHeight: "4px",
                display: "flex",
                flexDirection: "row",
                gap: "2%",
                zIndex: 10,
                pointerEvents: "none",
            }}
        >
            {Array.from({ length: 5 }).map((_, i) => (
                <Box
                    key={`pip_${i}`}
                    sx={{
                        flex: 1,
                        backgroundColor: i < stackPower ? activeColor : emptyColor,
                        borderRadius: "2px",
                        border: `1px solid rgba(0, 0, 0, 0.8)`,
                        boxSizing: "border-box",
                    }}
                />
            ))}
        </Box>
    );
};

// Ability textures that have completed a load once this session (see the fade note in AbilityCell).
const loadedAbilityTextures = new Set<string>();

// Three tiles must fit across the actual inner sidebar column. Account for both inter-tile gaps and the
// shell/scroll-well inset; using the legacy visual metric alone made only two oversized tiles fit on the
// narrower current sidebar.
const threeAcrossTileSize = (metrics: ISidebarMetrics): number => {
    const tileGap = metrics.gapPx;
    const innerInset = Math.max(6, Math.round(metrics.padPx * 0.32) + 4);
    return Math.max(24, Math.floor((metrics.contentWidth - innerInset - tileGap * 2) / 3));
};

const abilityTileSize = (metrics: ISidebarMetrics): number =>
    Math.min(Math.round(metrics.abilityCell * 1.4), threeAcrossTileSize(metrics));

// Measured approved fullscreen relationship: an effect icon is 71% of an ability tile by side
// (about 29% smaller). Fullscreen is already constrained to this size by the four-slot calculation;
// this cap only prevents a wider browser-window sidebar from inflating effects up to ability size.
const EFFECT_TO_ABILITY_RATIO = 0.71;
const EFFECT_TILE_BORDER_PX = 2;

// Buffs and debuffs use four fixed slots across the expanded sidebar. Their wells keep a fixed layout
// height; overflowing buff rows scroll vertically inside that slot instead of changing the card's fit scale.
const effectTileSize = (metrics: ISidebarMetrics): number => {
    const tileGap = metrics.gapPx * 0.6;
    const innerInset = Math.max(6, Math.round(metrics.padPx * 0.32) + 4);
    const fourAcrossSize = Math.floor((metrics.contentWidth - innerInset - tileGap * 3) / 4);
    const proportionalSize = Math.round(abilityTileSize(metrics) * EFFECT_TO_ABILITY_RATIO);
    return Math.max(24, Math.min(fourAcrossSize, proportionalSize));
};

const AbilityCell: React.FC<{
    ability: IVisibleImpact;
    teamType: TeamType;
    size: number;
    hasBreakApplied: boolean;
}> = ({ ability, teamType, size, hasBreakApplied }) => {
    // The game renders dark-only; the light palette is gone, so this is a constant.
    const isDarkMode = true;
    const auraColor = isDarkMode ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.75)";
    const disabledStatus = ability.isStolen
        ? { label: "STOLEN", color: "#9acd32", tooltip: "ABILITY STOLEN PERMANENTLY!\n" }
        : hasBreakApplied
          ? { label: "BREAK", color: "#ff0000", tooltip: "BREAK APPLIED!\n" }
          : undefined;

    // The stack-power pips and disabled-status overlay are pure CSS, so they'd otherwise pop in before the
    // ability image finishes loading (the pips visibly racing ahead). Gate them — and fade the image
    // in — on the image's load so everything appears together.
    //
    // The fade is a FIRST-load nicety only: the sidebar remounts these cells on every active-unit swap
    // (each replayed action!), and re-fading a texture that already loaded this session read as constant
    // sidebar flicker during replays. loadedAbilityTextures remembers what has loaded once so remounts
    // start visible.
    const [loaded, setLoaded] = React.useState(() => loadedAbilityTextures.has(ability.smallTextureName));
    const markLoaded = React.useCallback(() => {
        loadedAbilityTextures.add(ability.smallTextureName);
        setLoaded(true);
    }, [ability.smallTextureName]);
    const setImgRef = React.useCallback(
        (node: HTMLImageElement | null) => {
            // A cached image can already be complete before onLoad attaches — reconcile on mount.
            if (node?.complete && node.naturalWidth > 0) {
                markLoaded();
            }
        },
        [markLoaded],
    );

    return (
        <Tooltip
            title={
                <>
                    {disabledStatus?.tooltip}
                    {ability.name}:&nbsp;
                    {ability.description.split("\n").map((line, idx) => (
                        <React.Fragment key={idx}>
                            {line}
                            <br />
                        </React.Fragment>
                    ))}
                    {ability.amplifiedBy && (
                        // The percentage above ALREADY includes this artifact. Name it, with its own art,
                        // so a boosted number reads as "the charm is working" rather than as a mystery.
                        <Box
                            component="span"
                            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, marginTop: 0.5 }}
                        >
                            <Box
                                component="img"
                                // @ts-ignore: images index signature
                                src={images[ability.amplifiedBy.textureName]}
                                alt=""
                                sx={{ width: 16, height: 16, borderRadius: "20%", flex: "none" }}
                            />
                            {`includes +${ability.amplifiedBy.percent}% from ${ability.amplifiedBy.name}`}
                        </Box>
                    )}
                </>
            }
            sx={commonTooltipSx}
        >
            <Box
                sx={{
                    position: "relative",
                    // Sized in px from the measured bar width so the tiles neither overhang a 128px bar
                    // nor balloon to 90px squares on an ultrawide.
                    width: `${size}px`,
                    height: `${size}px`,
                    flex: "none",
                    overflow: "visible",
                    borderRadius: ability.isAura ? "50%" : "15%",
                    // Handoff tile frame — bronze rim, gold hairline, drop shadow.
                    border: "2px solid #0d0906",
                    boxShadow: "inset 0 0 0 1px rgba(150,130,98,.22), 0 2px 6px rgba(0,0,0,.7)",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "100%",
                        height: "100%",
                        transform: "translate(-50%, -50%)",
                        borderRadius: ability.isAura ? "50%" : "20%",
                        boxShadow: ability.isAura ? `-20px 0 -20px 60px ${auraColor}` : "none",
                        zIndex: 0,
                    },
                }}
            >
                <Box
                    component="img"
                    ref={setImgRef}
                    // @ts-ignore: images index signature
                    src={images[ability.smallTextureName]}
                    // Cached textures paint on the same frame instead of flashing one blank frame.
                    decoding="sync"
                    onLoad={markLoaded}
                    onError={markLoaded}
                    sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        zIndex: 1,
                        // ✅ CLIP IMAGE ONLY
                        borderRadius: ability.isAura ? "50%" : "15%",
                        imageRendering: "auto",
                        transform: "translateZ(0)",
                        opacity: loaded ? 1 : 0,
                        transition: "opacity 160ms ease-out, transform 160ms ease-out",
                        willChange: "opacity, transform",
                    }}
                />
                {loaded && disabledStatus && (
                    <AbilityStatusOverlay
                        isAura={ability.isAura}
                        label={disabledStatus.label}
                        color={disabledStatus.color}
                    />
                )}
                {loaded && (
                    <StackPowerOverlay
                        stackPower={ability.isStackPowered ? ability.stackPower : 0}
                        teamType={teamType}
                        isAura={ability.isAura}
                    />
                )}
            </Box>
        </Tooltip>
    );
};

const AbilityStack: React.FC<IAbilityStackProps & { metrics: ISidebarMetrics; hasBreakApplied: boolean }> = ({
    abilities,
    teamType,
    metrics,
    hasBreakApplied,
}) => {
    const filtered = abilities.filter((ability) => ability.laps > 0);

    return (
        <Stack
            direction="row"
            flexWrap="nowrap"
            sx={{ width: "max-content", minWidth: "100%", gap: `${metrics.gapPx}px` }}
        >
            {filtered.map((ability, index) => (
                <AbilityCell
                    key={`${ability.name}-${ability.smallTextureName}-${index}`}
                    ability={ability}
                    teamType={teamType}
                    size={abilityTileSize(metrics)}
                    hasBreakApplied={hasBreakApplied}
                />
            ))}
        </Stack>
    );
};

/**
 * Small count badge drawn on a stacking effect's icon (today: Poison). One application is the normal case
 * and carries no badge — the number only appears once the effect has actually stacked, so the icon row
 * stays quiet for every non-stacking debuff.
 */
const StackCountBadge: React.FC<{ stacks?: number }> = ({ stacks }) => {
    if (!stacks || stacks < 2) return null;

    return (
        <Box
            sx={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                zIndex: 4,
                minWidth: "1.15em",
                height: "1.15em",
                paddingX: "0.15em",
                borderRadius: "0.6em",
                backgroundColor: "rgba(12, 12, 12, 0.92)",
                border: "1px solid rgba(255, 255, 255, 0.75)",
                color: "rgba(255, 255, 255, 0.95)",
                fontSize: "9px",
                lineHeight: "1.15em",
                fontWeight: 700,
                textAlign: "center",
                pointerEvents: "none",
            }}
        >
            {stacks}
        </Box>
    );
};

/**
 * One labelled, wrapping row of buff (or debuff) icons. Buffs used to render either as a narrow column
 * squeezed beside the portrait or as a full-width row depending on the screen, which meant two very
 * different looks and a 13%-wide icon that vanished on a narrow bar; a single row that wraps behaves the
 * same everywhere and costs one line when the unit only carries one or two effects.
 */
// Carved stone panel from the fight-sidebar handoff. Wraps the stat grid (and the turn card) so the block
// reads as an inset plate rather than icons floating on the bar.
export const stonePlateSx = {
    padding: "10px",
    borderRadius: "3px",
    // Neutral, not brown: the sidebars are now tinted to the board's stone (rgb 18,18,17), and a warm
    // plate on a neutral bar reads as a leftover. Same luminance as before, warm bias removed.
    background:
        "repeating-linear-gradient(135deg, rgba(255,255,255,.012) 0 1px, transparent 1px 7px), linear-gradient(180deg, rgba(28,27,24,.96), rgba(9,9,8,.98))",
    border: "2px solid #080706",
    outline: "1px solid rgba(132,92,53,.34)",
    outlineOffset: "-4px",
    boxShadow: "inset 0 0 0 1px rgba(196,148,83,.16), inset 0 2px 12px rgba(0,0,0,.82), 0 3px 8px rgba(0,0,0,.68)",
} as const;

// Team colour lives only as a diffuse, fire-like aura behind the portrait — three blurred discs that
// breathe and flicker. No cloth banner, and nothing clips the ring.

// A slow, steady burn. Opacity barely moves (no blinking) — what changes is the silhouette: the corner
// radii creep from one irregular shape to the next over ~20s, so the edge is always drifting and never
// snaps. Long, mutually indivisible periods keep the layers from ever lining up into a visible cycle.
const teamAuraKeyframes = {
    "@keyframes hocFlameA": {
        "0%": { borderRadius: "46% 54% 43% 57% / 56% 49% 51% 44%", transform: "translate(-50%, -50%) scale(1, 1)" },
        "27%": {
            borderRadius: "55% 45% 52% 48% / 47% 57% 43% 53%",
            transform: "translate(-50%, -51%) scale(1.02, 1.05)",
        },
        "53%": {
            borderRadius: "43% 57% 47% 53% / 58% 45% 55% 42%",
            transform: "translate(-50%, -50%) scale(0.99, 1.01)",
        },
        "78%": {
            borderRadius: "52% 48% 56% 44% / 49% 54% 46% 51%",
            transform: "translate(-50%, -51%) scale(1.03, 1.06)",
        },
        "100%": { borderRadius: "46% 54% 43% 57% / 56% 49% 51% 44%", transform: "translate(-50%, -50%) scale(1, 1)" },
    },
    "@keyframes hocFlameB": {
        "0%": { borderRadius: "57% 43% 51% 49% / 45% 55% 45% 55%", transform: "translate(-50%, -50%) scale(1, 1)" },
        "31%": {
            borderRadius: "45% 55% 44% 56% / 57% 44% 56% 43%",
            transform: "translate(-50%, -51%) scale(1.03, 1.06)",
        },
        "59%": {
            borderRadius: "53% 47% 57% 43% / 44% 56% 44% 56%",
            transform: "translate(-50%, -50%) scale(0.98, 1.01)",
        },
        "84%": {
            borderRadius: "48% 52% 47% 53% / 54% 47% 53% 46%",
            transform: "translate(-50%, -51%) scale(1.02, 1.04)",
        },
        "100%": { borderRadius: "57% 43% 51% 49% / 45% 55% 45% 55%", transform: "translate(-50%, -50%) scale(1, 1)" },
    },
} as const;

// The Disguise aura reaches the card under the effect's own name from the local engine and under the
// ability's name from a ranked snapshot, so both spellings have to be recognised.
const isDisguise = (name: string): boolean => name === "Disguise" || name === "Disguise Aura";

const STAT_ROW_GAP = 8;

// Slim bronze scrollbar, shared with the Up-next strip.
export const hocScrollSx = {
    "&::-webkit-scrollbar": { width: "6px", height: "6px" },
    "&::-webkit-scrollbar-track": { background: "rgba(0,0,0,0.35)", borderRadius: "3px" },
    "&::-webkit-scrollbar-thumb": {
        background: "rgba(202,162,79,0.65)",
        borderRadius: "3px",
        "&:hover": { background: "rgba(202,162,79,0.9)" },
    },
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(202,162,79,0.65) rgba(0,0,0,0.35)",
} as const;

// A constant-height vertical well used by the stat grid.
const ScrollWell: React.FC<{
    height: number;
    children: React.ReactNode;
    /**
     * Open on the LAST row instead of the first. What arrives late is what changed — the buff that just
     * landed — while the head of the list is the same army-wide badges every turn. `pinKey` says when to
     * re-pin: it changes only when the contents do, so scrolling up to read something stays put until the
     * next real change rather than being yanked back on every timer tick.
     */
    pinToEnd?: boolean;
    pinKey?: string;
}> = ({ height, children, pinToEnd = false, pinKey }) => {
    const wellRef = React.useRef<HTMLDivElement | null>(null);
    React.useLayoutEffect(() => {
        if (!pinToEnd || !wellRef.current) {
            return;
        }
        wellRef.current.scrollTop = wellRef.current.scrollHeight;
    }, [pinToEnd, pinKey]);

    return (
        <Box
            ref={wellRef}
            sx={{ height: `${height}px`, overflowY: "auto", overflowX: "hidden", pr: "2px", ...hocScrollSx }}
        >
            {children}
        </Box>
    );
};

// Fixed-height icon well. Abilities/debuffs remain horizontal strips; Buffs opts into a wrapped vertical
// well whose scrollbar sits on the right, so a normal mouse-wheel gesture reaches additional rows.
const IconScrollWell: React.FC<{
    height: number;
    children: React.ReactNode;
    offsetY?: number;
    vertical?: boolean;
}> = ({ height, children, offsetY = 0, vertical = false }) => (
    <Box
        onWheel={
            vertical
                ? (event) => {
                      const well = event.currentTarget;
                      if (well.scrollHeight <= well.clientHeight) return;
                      well.scrollTop += event.deltaY;
                      event.stopPropagation();
                  }
                : undefined
        }
        sx={{
            position: "relative",
            // Keep the vertical rail inside the sidebar's decorative right frame instead of painting
            // underneath it, where the thumb looked absent even while the well was scrollable.
            width: vertical ? "calc(100% - 8px)" : "100%",
            mr: vertical ? "8px" : 0,
            height: `${height}px`,
            boxSizing: "border-box",
            overflowX: vertical ? "hidden" : "auto",
            overflowY: vertical ? "scroll" : "hidden",
            whiteSpace: vertical ? "normal" : "nowrap",
            pr: vertical ? "5px" : 0,
            scrollbarGutter: vertical ? "stable" : "auto",
            overscrollBehaviorY: vertical ? "contain" : "auto",
            touchAction: vertical ? "pan-y" : "auto",
            transform: offsetY ? `translateY(${offsetY}px)` : "none",
            ...hocScrollSx,
            "&::-webkit-scrollbar": vertical ? { width: "7px" } : { height: "5px" },
        }}
    >
        {children}
    </Box>
);

// Section caption + the 2px rule under it. Used for Abilities / Buffs / Debuffs here and for Up next in
// the sidebar itself, so all four headings read as one family.
const UNIT_SECTION_PLAQUE_HEIGHT_SCALE = 0.75;

export const SectionTitle: React.FC<{
    title: string;
    metrics: ISidebarMetrics;
    displayFont?: boolean;
    preserveCase?: boolean;
    namePlaque?: boolean;
    heightScale?: number;
}> = ({ title, metrics, displayFont = false, preserveCase = false, namePlaque = false, heightScale = 1 }) => {
    const fontSizeRem = metrics.sectionTitleRem * (namePlaque ? 1.45 : displayFont ? 1.1 : 1);
    const naturalHeightPx = fontSizeRem * 16 + (namePlaque ? 6 : 12);
    const scaledHeightPx = naturalHeightPx * heightScale;

    return (
        <Box
            sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                // Keep a compact plaque centred on the original divider axis so neighbouring sections and
                // the selected-unit frame retain their approved positions.
                position: heightScale === 1 ? "static" : "relative",
                top: heightScale === 1 ? 0 : `${(naturalHeightPx - scaledHeightPx) / 2}px`,
            }}
        >
            <Box
                sx={{ height: "1px", flex: 1, background: "linear-gradient(90deg, transparent, rgba(132,91,52,.58))" }}
            />
            <Typography
                level="title-sm"
                sx={{
                    // The three unit-card plaques are deliberately 10% larger than the shared Up next title.
                    // This is local to displayFont; the common font metrics remain unchanged everywhere else.
                    fontSize: `${fontSizeRem}rem`,
                    ...(displayFont
                        ? {
                              fontFamily: hocDisplayFontFamily,
                              fontSynthesis: "weight",
                              // 10% more than the chosen global HoC Forge spacing (0.121em).
                              letterSpacing: "0.1331em",
                          }
                        : {}),
                    fontWeight: 800,
                    lineHeight: 1,
                    ...(!displayFont ? { letterSpacing: "0.16em" } : {}),
                    textTransform: preserveCase ? "none" : "uppercase",
                    color: "#d7b77b",
                    textShadow: "0 1px 0 rgba(0,0,0,.9)",
                    px: namePlaque ? "14px" : "10px",
                    py: heightScale === 1 ? (namePlaque ? "2px" : "5px") : 0,
                    ...(heightScale === 1
                        ? {}
                        : {
                              height: `${scaledHeightPx}px`,
                              boxSizing: "border-box",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                          }),
                    minWidth: namePlaque ? "58.8%" : "42%",
                    textAlign: "center",
                    clipPath: "polygon(7px 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 7px 100%, 0 50%)",
                    background: namePlaque
                        ? "linear-gradient(180deg, rgba(44,37,30,.59), rgba(14,13,12,.605))"
                        : "linear-gradient(180deg, rgba(44,37,30,.96), rgba(14,13,12,.98)) padding-box, linear-gradient(90deg, #241a12, #8b6238, #241a12) border-box",
                    border: "1px solid transparent",
                    ...(namePlaque
                        ? {
                              borderImage: "linear-gradient(90deg, #241a12, #8b6238, #241a12) 1",
                          }
                        : {}),
                    boxShadow: "inset 0 1px 0 rgba(237,190,121,.12), 0 2px 4px rgba(0,0,0,.55)",
                }}
            >
                {title}
            </Typography>
            <Box
                sx={{
                    height: "1px",
                    flex: 1,
                    background: "linear-gradient(90deg, rgba(132,91,52,.58), transparent)",
                }}
            />
        </Box>
    );
};

const PanelSection: React.FC<{
    title: string;
    metrics: ISidebarMetrics;
    children: React.ReactNode;
    overlayTitle?: boolean;
    offsetY?: number;
    titleHeightScale?: number;
}> = ({ title, metrics, children, overlayTitle = false, offsetY = 0, titleHeightScale = 1 }) => (
    <Box
        sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            transform: offsetY ? `translateY(${offsetY}px)` : "none",
            // Buff/debuff wells need only a compact inset below their plaques; Abilities gets its larger
            // dedicated offset from the lifted overlay-title wrapper below.
            gap: `${Math.max(2, Math.round(metrics.gapPx * (overlayTitle ? 0.4 : 0.65)))}px`,
        }}
    >
        <Box
            sx={
                overlayTitle
                    ? {
                          position: "relative",
                          // The selected portrait/stat layer deliberately reaches the divider's centre.
                          // Keep the plaque and both rule segments above that artwork.
                          zIndex: 6,
                          // Reserve one compact gap below the lifted plaque so the enlarged ability art
                          // starts after its lower rim instead of sliding underneath it.
                          height: `${Math.round(metrics.gapPx)}px`,
                          transform: `translateY(calc(-50% - ${Math.round(metrics.gapPx * 0.5)}px))`,
                      }
                    : undefined
            }
        >
            <SectionTitle title={title} metrics={metrics} displayFont heightScale={titleHeightScale} />
        </Box>
        {children}
    </Box>
);

/** The unit readout now lives inside the sidebar's single outer frame. This wrapper only reserves room
 * for the section plaque; it deliberately has no second full-height frame competing with the sidebar. */
const unitDetailsShellSx = (metrics: ISidebarMetrics) =>
    ({
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: `0 ${Math.max(2, Math.round(metrics.padPx * 0.16))}px`,
        // The fit-scaled card is narrower than the sidebar. Portrait and stats counter that horizontal
        // scale and must be allowed to reach the outer viewport, whose frame supplies the final clip.
        overflow: "visible",
    }) as const;

// Just the tiles. Split out of EffectRow so the Buffs section can put buff tiles and synergy badges under
// a single caption.
const EffectTiles: React.FC<{
    effects: IVisibleImpact[];
    title: string;
    metrics: ISidebarMetrics;
    /** See SynergiesRow's `inline`: hand the tiles to the parent's horizontal strip. */
    inline?: boolean;
}> = ({ effects, title, metrics, inline = false }) => {
    if (!effects.length) return null;

    return (
        <>
            <Box
                sx={{
                    display: inline ? "contents" : "flex",
                    flexDirection: "row",
                    flexWrap: "nowrap",
                    width: inline ? undefined : "max-content",
                    minWidth: inline ? undefined : "100%",
                    gap: `${metrics.gapPx * 0.6}px`,
                }}
            >
                {effects.map((effect, index) => (
                    <Tooltip
                        key={`${title}-${effect.name}-${effect.smallTextureName}-${index}`}
                        title={`${effect.name}: ${effect.description.substring(0, effect.description.length - 1)}${effect.laps > 0 && effect.laps !== Number.MAX_SAFE_INTEGER && effect.laps !== HoCConstants.NUMBER_OF_LAPS_TOTAL ? ` (remaining ${HoCLib.getLapString(effect.laps)})` : ""}`}
                        sx={commonTooltipSx}
                    >
                        <Box
                            sx={{
                                position: "relative",
                                display: "inline-flex",
                                width: `${effectTileSize(metrics)}px`,
                                height: `${effectTileSize(metrics)}px`,
                                flex: "none",
                                // Same tile frame as the ability cells — see the handoff.
                                borderRadius: effect.isAura ? "50%" : "15%",
                                border: `${EFFECT_TILE_BORDER_PX}px solid #0d0906`,
                                boxShadow: "inset 0 0 0 1px rgba(150,130,98,.22), 0 2px 6px rgba(0,0,0,.7)",
                            }}
                        >
                            <Box
                                component="img"
                                // @ts-ignore: images index signature
                                src={images[effect.smallTextureName]}
                                // The buffs/debuffs rows remount on every active-unit swap (each replayed
                                // action); sync decoding paints cached tiles on the same frame instead of
                                // flashing one blank frame per swap.
                                decoding="sync"
                                sx={{
                                    width: "100%",
                                    maxWidth: "100%",
                                    height: "auto",
                                    aspectRatio: "1",
                                    objectFit: "contain",
                                    zIndex: 3,
                                    borderRadius: effect.isAura ? "50%" : undefined,
                                    imageRendering: "auto",
                                    transform: "translateZ(0)",
                                    transition: "opacity 160ms ease-out, transform 160ms ease-out",
                                    willChange: "opacity, transform",
                                }}
                            />
                            <StackCountBadge stacks={effect.stacks} />
                        </Box>
                    </Tooltip>
                ))}
            </Box>
        </>
    );
};

/**
 * One cell of the stat plate. Optionally carries a second stat beside the first — morale and luck share a
 * cell so a creature with extra (ranged) stats still fits the fixed three-row grid.
 */
/**
 * One icon + number.
 *
 * forwardRef, and it spreads whatever else it is given onto the Box, because every one of these is wrapped
 * in a <Tooltip>. MUI hands its child the hover/focus handlers and a ref by cloning it; a plain function
 * component silently drops both, and the stat explanations stop appearing on hover with nothing in the
 * console to say why. If this stops forwarding, the tooltips go quiet again.
 */
// Every figure on this plate is the FINAL, effective one: attack already carries attack_mod and the
// multiplier, armor its armor_mod, steps their steps_mod, luck its luck_mod, and magic resist / range
// shots the mods that REPLACE their base. The plate used to print the signed delta beside each of them
// ("+2", "-1", "x1.5") as well, which meant a stat could show two or three numbers at once and the reader
// had to work out which one actually applied. Only the effective value is shown now.

const StatValue = React.forwardRef<
    HTMLDivElement,
    {
        icon: React.ReactElement<Record<string, unknown>>;
        value: string | number;
        color: string;
        metrics: ISidebarMetrics;
    } & React.HTMLAttributes<HTMLDivElement>
>(({ icon, value, color, metrics, ...tooltipProps }, ref) => (
    // No buff/debuff frame: a modified stat used to get a pulsing green or red ring, which on creatures
    // that carry a permanent modifier sat on screen for the whole fight and read as clutter.
    <Box
        ref={ref}
        {...tooltipProps}
        sx={{ display: "inline-flex", alignItems: "center", width: "fit-content", minWidth: 0 }}
    >
        {React.cloneElement(icon, {
            sx: { color, fontSize: `${metrics.statIconPx}px`, pr: "3px", flex: "none" },
        })}
        <Typography
            fontSize={`${metrics.statFontRem * 1.15}rem`}
            component="span"
            sx={{ whiteSpace: "nowrap", fontWeight: 600, fontSynthesis: "weight" }}
        >
            {value}
        </Typography>
    </Box>
));
StatValue.displayName = "StatValue";

/** Where the portrait's top edge lands on the banner, as a share of the art's height — just under the
 *  crossbar's valance, which is the last thing on the cloth now that the crenellated line has been cut out
 *  of it. This is the anchor: how tall the banner draws, how far it reaches above the card and where the
 *  name sits all follow from it.
 *
 *  It has to be an anchor rather than a consequence. Solving the height off the name instead left the lift
 *  tending to a fixed share of the height while this stayed at its own, so the two crossed and the art's
 *  head cut further into the portrait the larger the card got. */
const BANNER_PORTRAIT_TOP = 0.1229;

/** How far the name clears the very top of the banner. Zero: the row starts on the banner's own top edge,
 *  and its line-height already carries half-leading above the letters, so nothing actually touches the
 *  crossbar. */
const NAME_TOP_PAD_PX = 6;
/** The stat plate's own 2px rim. The banner's hem runs down behind it, so no strip of bare card shows between
 *  bright cloth and the plate — that gap plus the near-black rim read as a black rule under the banner. */
const STAT_PLATE_RIM_PX = 2;

/** The complete pink-boundary card uses the exact 190:256 pick-stage silhouette at full content width. */
const portraitBoxPx = (metrics: ISidebarMetrics): number => Math.round(metrics.contentWidth);

/** The name plaque keeps the shared section geometry, but its type fills the height: 2px vertical padding
 *  and the same 1px transparent border on both sides. */
const nameTextHeightPx = (metrics: ISidebarMetrics): number => Math.round(metrics.sectionTitleRem * 1.45 * 16) + 4 + 2;

/**
 * Everything the banner and the name row are laid out from, solved in one place so the pieces cannot drift.
 *
 * The crest lands on the top of the portrait; the hem runs down behind the stat plate's rim; and the name is
 * centred on the strip of plain cloth between the crossbar and the crest. The banner's top edge is already at
 * the panel's top — which is the screen's top, where nothing clips, it simply is not there — so the name's
 * room has to come out of the card, not out of a further lift.
 */
const bannerLayout = (metrics: ISidebarMetrics) => {
    const portrait = portraitBoxPx(metrics);
    const columnGap = Math.round(metrics.gapPx * 0.5);
    const overhang = columnGap + STAT_PLATE_RIM_PX;
    const height = Math.round(portrait / CREATURE_PORTRAIT_ASPECT);
    const crest = Math.round(BANNER_PORTRAIT_TOP * height);
    const text = nameTextHeightPx(metrics);
    // Hard to the top of the banner rather than centred in the cloth below the crossbar: the crest is thick,
    // and splitting the run left the name sitting on it. Everything the name does not take goes to the
    // portrait, which is what closes the gap of bare cloth that opened between the two.
    //
    // These margins are the entire distance from the banner's top to the portrait — the card's column gap
    // sits lower down, between the portrait and the plate, not under this line. Counting it here pushed the
    // banner's top up past the panel's own edge.
    const above = NAME_TOP_PAD_PX;
    const below = Math.max(0, crest - above - text);
    const lift = above + text + below;
    const portraitHeight = Math.max(60, height - lift - overhang);
    return { portrait, portraitHeight, above, below, lift, overhang, height };
};

const StatItem: React.FC<{
    icon: React.ReactElement<Record<string, unknown>>;
    value: string | number;
    tooltip: string;
    color: string;
    metrics: ISidebarMetrics;
    secondIcon?: React.ReactElement<Record<string, unknown>>;
    secondValue?: string | number;
    secondColor?: string;
    secondTooltip?: string;
}> = ({ icon, value, tooltip, color, metrics, secondIcon, secondValue, secondColor, secondTooltip }) => {
    const first = <StatValue icon={icon} value={value} color={color} metrics={metrics} />;

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                minWidth: 0,
                // Per the handoff each stat sits in its own shallow recess inside the stone plate. Every
                // cell is one grid track wide, so the block is the same three-up shape for every creature.
                padding: "3px 6px",
                borderRadius: "5px",
                background: "rgba(0,0,0,.32)",
                boxShadow: "inset 0 0 0 1px rgba(150,130,98,.14)",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "nowrap",
                    minWidth: 0,
                    gap: "4px",
                    // The portrait/stat shell cancels the card's horizontal fit scale so its containers
                    // still meet the sidebar rails. Reapply that scale only to the icon/value group: its
                    // X and Y factors are equal again, preserving the original glyph and icon proportions.
                    transform: "scaleX(var(--sidebar-card-fit-scale, 1))",
                    transformOrigin: "center",
                }}
            >
                <Tooltip title={tooltip} sx={commonTooltipSx}>
                    {first}
                </Tooltip>
                {secondIcon && secondValue !== undefined && (
                    <Tooltip title={secondTooltip ?? ""} sx={commonTooltipSx}>
                        <StatValue
                            icon={secondIcon}
                            value={secondValue}
                            color={secondColor ?? color}
                            metrics={metrics}
                        />
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
};

const UnitStatsLayout: React.FC<{
    unitProperties: UnitProperties;
    damageRange: string;
    attackTypeSelected: AttackType;
    attackDamage: number;
    meleeArmor: number;
    rangeArmor: number;
    stepsMod: number;
    hasDifferentRangeArmor: boolean;
    isDarkMode: boolean;
    metrics: ISidebarMetrics;
    largeTextureName: string;
    images: { [key: string]: string };
    onImageLoaded: () => void;
    abilities: IVisibleImpact[];
    buffs: IVisibleImpact[];
    debuffs: IVisibleImpact[];
    hasBreakApplied: boolean;
    team: TeamType;
}> = ({
    unitProperties,
    damageRange,
    attackTypeSelected,
    attackDamage,
    meleeArmor,
    rangeArmor,
    stepsMod,
    hasDifferentRangeArmor,
    isDarkMode,
    metrics,
    largeTextureName,
    images,
    onImageLoaded,
    abilities,
    buffs,
    debuffs,
    hasBreakApplied,
    team,
}) => {
    const creatureId = UNIT_NAME_TO_ID[unitProperties.name.trim()];
    const sidebarPortraitArt = creatureId === undefined ? {} : resolveLeftSidebarPortraitArt(creatureId);
    const [sidebarPortraitTuning, setSidebarPortraitTuning] = useState<LeftSidebarPortraitTuning>(() =>
        creatureId === undefined
            ? { ...DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING }
            : resolveLeftSidebarPortraitTuning(creatureId),
    );
    useEffect(() => {
        const syncTuning = () =>
            setSidebarPortraitTuning(
                creatureId === undefined
                    ? { ...DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING }
                    : resolveLeftSidebarPortraitTuning(creatureId),
            );
        const syncStoredTuning = (event: StorageEvent) => {
            if (event.key === LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY) syncTuning();
        };

        syncTuning();
        window.addEventListener(LEFT_SIDEBAR_PORTRAIT_TUNING_EVENT, syncTuning);
        window.addEventListener("storage", syncStoredTuning);
        return () => {
            window.removeEventListener(LEFT_SIDEBAR_PORTRAIT_TUNING_EVENT, syncTuning);
            window.removeEventListener("storage", syncStoredTuning);
        };
    }, [creatureId]);
    const animationConfig = creatureId === undefined ? getDefaultAnimationConfig(unitProperties.name) : null;
    const showRangedStats =
        unitProperties.attack_type === AttackVals.RANGE ||
        // Runtime shooter: a melee unit holding a stolen Endless Quiver gains shots
        // (range_shots_mod) and a granted shot_distance — show its ranged stats too.
        (unitProperties.shot_distance > 0 && (unitProperties.range_shots_mod || unitProperties.range_shots) > 0);

    // Order matters: the seven stats every creature has come first, in a fixed sequence, and the handful
    // that only some carry are appended after them. Otherwise a conditional cell in the middle re-seats
    // everything behind it, and the same stat lands in a different grid slot from one creature to the next.
    const statsContent = (
        <>
            <StatItem
                icon={<HeartIcon />}
                value={`${formatSidebarStat(unitProperties.hp)}/${formatSidebarStat(unitProperties.max_hp)}`}
                tooltip="Current/max Health Points"
                color="#ff4d4d"
                metrics={metrics}
            />
            <StatItem
                icon={<FistIcon />}
                value={damageRange}
                tooltip="Attack spread"
                color="#c0c0c0"
                metrics={metrics}
            />
            <StatItem
                icon={attackTypeSelected === AttackVals.RANGE ? <BowIcon /> : <SwordIcon />}
                value={formatSidebarStat(attackDamage)}
                tooltip="Attack type and multiplier"
                color={attackTypeSelected === AttackVals.RANGE ? "#ffd700" : "#a52a2a"}
                metrics={metrics}
            />
            <StatItem
                icon={<ShieldIcon />}
                value={formatSidebarStat(meleeArmor)}
                tooltip={hasDifferentRangeArmor ? "Armor against melee attacks" : "Armor"}
                color="#4682b4"
                metrics={metrics}
                // A creature that armours differently against arrows shows both figures in ONE cell, the
                // way morale and luck share theirs. They are the same stat read against two attack types,
                // so splitting them across the grid made the pair read as unrelated -- and the second cell
                // only existed for some creatures, which shifted every stat after it.
                secondIcon={hasDifferentRangeArmor ? <ArrowShieldIcon /> : undefined}
                secondValue={hasDifferentRangeArmor ? formatSidebarStat(rangeArmor) : undefined}
                secondColor="#f4a460"
                secondTooltip="Armor against ranged attacks"
            />
            <StatItem
                icon={<MagicShieldIcon />}
                value={`${formatSidebarStat(unitProperties.magic_resist_mod || unitProperties.magic_resist)}%`}
                tooltip="Magic resist in %"
                color="#8a2be2"
                metrics={metrics}
            />
            {/* Movement range and initiative share a cell: both answer "how does this stack move through
                the turn", and pairing them keeps the plate at seven fixed slots. */}
            <StatItem
                icon={unitProperties.movement_type === MovementVals.FLY ? <WingIcon /> : <BootIcon />}
                // OWNER call: show the exact fractional stat (Elf's 2.93), with insignificant trailing
                // zeroes dropped — and since 2026-08-06 the ENGINE moves on the same pure fraction (no rounding:
                // a straight cell costs 1, a diagonal ~1.41, Trent's own vines 0.5), so the display and
                // the board can no longer disagree.
                value={formatSidebarStat(unitProperties.steps + stepsMod)}
                tooltip="Movement budget in cells: straight costs 1, diagonal ~1.41 — spent exactly, no rounding"
                color={unitProperties.movement_type === MovementVals.FLY ? "#00ff7f" : "#8b4513"}
                metrics={metrics}
                secondIcon={<HourglassIcon />}
                secondValue={formatSidebarStat(unitProperties.initiative)}
                secondColor={isDarkMode ? "#f5fefd" : "#000000"}
                secondTooltip="Units with higher initiative turn first"
            />
            {/* Morale and luck share one cell. They are the two smallest, most closely related numbers, and
                pairing them buys back a slot — a ranged creature carries enough extra stats to spill onto a
                fourth row otherwise, which moved everything below the plate. */}
            <StatItem
                icon={<MoraleIcon />}
                value={formatSidebarStat(Math.round(unitProperties.morale))}
                tooltip="Morale grants extra actions, and adds movement steps once the map starts narrowing"
                color={isDarkMode ? "#ffff00" : "#DC4D01"}
                metrics={metrics}
                secondIcon={<LuckIcon />}
                secondValue={formatSidebarStat(Math.round(unitProperties.luck + unitProperties.luck_mod))}
                secondColor="#ff4040"
                secondTooltip="Luck raises damage rolls and the power of abilities"
            />
            {/* Spellbook scroll count: the only readout of how many casts a spellcaster has left —
                without it, answering that question means opening the spellbook. */}
            {unitProperties.can_cast_spells && (
                <StatItem
                    icon={<ScrollIcon />}
                    value={formatSidebarStat(unitProperties.spells.length)}
                    tooltip="Magic scrolls left to cast"
                    color="#add8e6"
                    metrics={metrics}
                />
            )}
            {showRangedStats && (
                <StatItem
                    icon={<ShotRangeIcon />}
                    value={formatSidebarStat(unitProperties.shot_distance)}
                    tooltip="Ranged shot distance in cells"
                    color="#ffff00"
                    metrics={metrics}
                />
            )}
            {showRangedStats && !!(unitProperties.range_shots_mod || unitProperties.range_shots) && (
                <StatItem
                    icon={<QuiverIcon />}
                    value={formatSidebarStat(unitProperties.range_shots_mod || unitProperties.range_shots)}
                    tooltip="Number of ranged shots"
                    color="#cd5c5c"
                    metrics={metrics}
                />
            )}
        </>
    );
    // The Buffs well is the ONLY place synergies appear — the sidebar's old strip and ranked's top-left
    // panel are both gone — so every synergy the army carries shows here, leading the row. Two are asked
    // about per creature rather than per army, because for most creatures they are simply untrue: Might's
    // aura range only pays off for a stack that emits an aura itself, and Nature's armour bonus is handed
    // to flyers only.
    const unitSynergies = ((unitProperties as UnitProperties).synergies as string[]) ?? [];
    const emitsAura = abilities.some((ability) => ability.isAura);
    const isFlyingUnit = unitProperties.movement_type === MovementVals.FLY;
    const shownSynergies = unitSynergies.filter(
        (synergyKey) =>
            (emitsAura || !isAuraRangeSynergy(synergyKey)) && (isFlyingUnit || !isFlyArmorSynergy(synergyKey)),
    );

    // Fixed reading order down the well after them: the army-wide, whole-fight things first — augments,
    // then artifacts — and the per-turn traffic last. Ranked rather than sorted by arrival, so a buff never
    // jumps groups the moment something else expires; the sort is stable, so inside a group the engine's
    // own order survives.
    const buffRank = (buff: IVisibleImpact): number => {
        if (buff.name.endsWith(" Augment")) return 0;
        if (buff.description.startsWith("Artifact.")) return 1;
        return 2;
    };
    const orderedBuffs = buffs
        .map((buff, index) => ({ buff, index }))
        .sort((a, b) => buffRank(a.buff) - buffRank(b.buff) || a.index - b.index)
        .map((entry) => entry.buff);
    // Three stat rows, always — the well below scrolls if a creature carries more than nine.
    const statRowHeight = Math.round(metrics.statIconPx + 12);
    const statWellHeight = statRowHeight * 3 + STAT_ROW_GAP * 2;
    // One row of tiles each; anything beyond that scrolls inside the well rather than growing the card.
    const abilityWellHeight = abilityTileSize(metrics) + 6;
    // The shared effect size also applies to synergy/augment markers. The extra band holds their level
    // dots and the scrollbar without changing the section's position.
    const effectWellHeight = effectTileSize(metrics) + 9;
    // This is only the PAINT viewport inside the fixed-height Debuffs layout slot. It is deliberately
    // taller than the tile + frame + scrollbar, so the complete unscaled art can move upward without the
    // scrolling element clipping its lower edge. The outer wrapper below keeps the layout height unchanged.
    const debuffPaintWellHeight = effectTileSize(metrics) + 20;
    const layout = bannerLayout(metrics);
    const portraitHeight = layout.portraitHeight;
    // The frame itself closes on the centre of the Abilities divider. PanelSection first advances by the
    // card gap, then lifts its title wrapper by one full section gap; half of the plaque's rendered height
    // lands the border exactly on the horizontal rules running through the plaque centre.
    const abilityTitleHeightPx = metrics.sectionTitleRem * 1.1 * 16 + 12;
    const abilityDividerCenterExtensionPx = Math.round(
        Math.round(metrics.gapPx * 0.5) - Math.round(metrics.gapPx) + abilityTitleHeightPx * 0.5,
    );

    return (
        <Box
            sx={{
                position: "relative",
                width: "100%",
                height: "100%",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: `${Math.round(metrics.gapPx * 0.5)}px`,
            }}
        >
            {/* The creature fills the complete pick-card silhouette. Stats are an overlay on its lower
                portion, so they no longer add a second block below the image or change the card height. */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: `${Math.round(metrics.gapPx * 0.5)}px`,
                    // Expand portrait, stats and their frame through both authored padding layers to the
                    // physical left-panel edges. The rail overlays that larger silhouette without thickening.
                    width: "calc(100% + var(--sidebar-card-left-bleed, 0px) + var(--sidebar-card-right-bleed, 0px))",
                    ml: "calc(-1 * var(--sidebar-card-left-bleed, 0px))",
                    flex: "0 1 auto",
                    minHeight: 0,
                    // useFitScale may shrink the complete card to fit a short sidebar. Restore only this
                    // block's horizontal size so portrait and stats still touch the two inner frame rails.
                    transform: "scaleX(var(--sidebar-card-inverse-fit-scale, 1))",
                    transformOrigin: "top center",
                    position: "relative",
                    zIndex: 4,
                    // Keep only the selected frame's inner bronze/dark line. The broad carved outer rail is
                    // intentionally removed so the portrait and stats remain visible all the way to the
                    // panel edges. Name and Abilities plaques stay above this contour; the sidebar's own
                    // authored metal rails now run uninterrupted above the complete card as a HUD overlay.
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        // The artwork may overscan above the viewport; the frame itself begins on the visible
                        // panel edge so its upper mitres are never clipped off-screen.
                        top: `calc(${-layout.lift - layout.overhang}px - var(--sidebar-card-frame-top-gap, 0px))`,
                        right: 0,
                        // Close exactly on the Abilities divider; the ability tiles sit outside the frame.
                        bottom: `${-abilityDividerCenterExtensionPx}px`,
                        left: 0,
                        zIndex: 5,
                        boxSizing: "border-box",
                        border: "1px solid rgba(9, 7, 5, 0.98)",
                        borderBottom: 0,
                        boxShadow: "inset 0 0 0 1px rgba(151, 104, 54, 0.82), inset 0 0 0 2px rgba(4, 4, 3, 0.78)",
                        // Keep just the selected-card contour. It ends cleanly at the Abilities divider;
                        // the separate full-height sidebar rails no longer need any transition ornaments.
                        clipPath:
                            "polygon(0 0, 100% 0, 100% 100%, calc(100% - 3px) 100%, calc(100% - 3px) 3px, 3px 3px, 3px 100%, 0 100%)",
                        pointerEvents: "none",
                    },
                }}
            >
                <Box
                    sx={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        // The block is taller than the art so the glow has somewhere to go. Every layer is
                        // sized off the portrait and stays inside the bar's width — when they were fixed
                        // 470px discs the sidebar's `overflowX: hidden` sliced them into a visible black
                        // rectangle around the icon.
                        // Hugs the art. The flame layers are absolutely positioned, so they spill past this
                        // box without reserving any layout height — reserving it left a wide empty band
                        // between the name and the portrait, and again under it.
                        height: `${portraitHeight}px`,
                        minHeight: `${portraitHeight}px`,
                        flex: "0 0 auto",
                        overflow: "visible",
                        ...teamAuraKeyframes,
                    }}
                >
                    <Box
                        sx={{
                            // The portrait spans the complete card and remains visible through the
                            // translucent stat plate, matching the editor's full 190:256 canvas.
                            position: "absolute",
                            top: `calc(${-layout.lift - layout.overhang}px - var(--sidebar-card-top-extension, 0px))`,
                            left: 0,
                            right: 0,
                            zIndex: 1,
                            // Keep the authored top and width unchanged, extending the artwork until the
                            // card reaches the Abilities divider.
                            height: `calc(${layout.height + abilityDividerCenterExtensionPx}px + var(--sidebar-card-top-extension, 0px))`,
                            flex: "0 0 auto",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {creatureId !== undefined ? (
                            <CreaturePortraitImage
                                creatureId={creatureId}
                                alt={unitProperties.name}
                                artScale={sidebarPortraitTuning.artScale}
                                artScaleX={0.96 * (sidebarPortraitArt.artScaleX ?? 1)}
                                artOffsetX={sidebarPortraitTuning.artOffsetX}
                                artOffsetY={sidebarPortraitTuning.artOffsetY}
                                artSource={sidebarPortraitArt.source}
                                artFit={sidebarPortraitArt.fit}
                                artBaseScale={sidebarPortraitArt.baseScale}
                                highQualityArt
                                sx={{
                                    width: "100%",
                                    height: "100%",
                                    bgcolor: "transparent",
                                }}
                                imageStyle={{
                                    transition: "opacity 120ms ease-out",
                                    imageRendering: "auto",
                                }}
                            />
                        ) : animationConfig ? (
                            <AtlasAnimation
                                meta={animationConfig.meta}
                                src={animationConfig.imageSrc}
                                onLoaded={onImageLoaded}
                                maxHeight={portraitHeight}
                            />
                        ) : (
                            <Box
                                component="img"
                                // @ts-ignore: images index signature
                                src={images[largeTextureName]}
                                sx={{
                                    display: "block",
                                    width: "100%",
                                    maxHeight: "100%",
                                    height: "auto",
                                    objectFit: "contain",
                                    mx: "auto",
                                    transition: "opacity 120ms ease-out",
                                    imageRendering: "auto",
                                    transform: "translateZ(0)",
                                }}
                                onLoad={onImageLoaded}
                                onError={onImageLoaded}
                            />
                        )}
                    </Box>
                    <Box
                        sx={{
                            minWidth: 0,
                            position: "absolute",
                            left: 0,
                            right: 0,
                            // Extend the translucent stats surface only through the remaining few pixels
                            // to the frame on the Abilities divider. Its top and stat positions stay fixed.
                            bottom: `${-abilityDividerCenterExtensionPx}px`,
                            zIndex: 2,
                            ...stonePlateSx,
                            paddingBottom: `calc(10px + ${abilityDividerCenterExtensionPx}px)`,
                            // Twenty-five percent transparent: the creature continues visibly behind the plate,
                            // while the stat cells and their labels retain full opacity and contrast.
                            background:
                                "repeating-linear-gradient(135deg, rgba(255,255,255,.012) 0 1px, transparent 1px 7px), linear-gradient(180deg, rgba(28,27,24,.75), rgba(9,9,8,.75))",
                            // The individual stat cells keep their frames; only the common brown frame
                            // around the complete plate is removed.
                            border: "none",
                            outline: "none",
                            outlineOffset: 0,
                            boxShadow: "inset 0 2px 12px rgba(0,0,0,.55)",
                        }}
                    >
                        {/* Exactly three columns by three rows, always. A creature with extra stats (scrolls,
                            shot distance, shot count, separate range armour) scrolls inside this well instead
                            of adding a fourth row and pushing everything below the plate down. */}
                        <ScrollWell height={statWellHeight}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: `repeat(${metrics.statColumns}, minmax(0, 1fr))`,
                                    gridAutoRows: `${statRowHeight}px`,
                                    // Full width, matching the turn card below it.
                                    width: "100%",
                                    columnGap: "8px",
                                    rowGap: `${STAT_ROW_GAP}px`,
                                    alignContent: "start",
                                }}
                            >
                                {statsContent}
                            </Box>
                        </ScrollWell>
                    </Box>
                </Box>
            </Box>

            {/* All three blocks are always rendered at a constant height, empty or not, so the card is the
                same shape for every creature and nothing below it ever moves. */}
            <PanelSection
                title="Abilities"
                metrics={metrics}
                overlayTitle
                titleHeightScale={UNIT_SECTION_PLAQUE_HEIGHT_SCALE}
            >
                <IconScrollWell height={abilityWellHeight}>
                    <AbilityStack
                        abilities={abilities}
                        teamType={team}
                        metrics={metrics}
                        hasBreakApplied={hasBreakApplied}
                    />
                </IconScrollWell>
            </PanelSection>

            {/* Move the complete lower pair together. At the approved scale, 1.2 of the shared gap closes
                the extra empty band below the ability tiles and makes it match the plaque-to-tiles gap
                above them. Keeping both sections in this wrapper preserves their authored relationship. */}
            <Box
                sx={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: `${Math.round(metrics.gapPx * 0.5)}px`,
                    transform: `translateY(${-Math.round(metrics.gapPx * 1.2)}px)`,
                }}
            >
                <PanelSection title="Buffs" metrics={metrics} titleHeightScale={UNIT_SECTION_PLAQUE_HEIGHT_SCALE}>
                    <IconScrollWell height={effectWellHeight} offsetY={-Math.round(metrics.gapPx)} vertical>
                        {/* Additional buffs wrap into rows inside this fixed-height vertically scrolling well. */}
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "row",
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                                alignContent: "flex-start",
                                width: "100%",
                                height: "max-content",
                                minWidth: 0,
                                gap: `${metrics.gapPx * 0.6}px`,
                            }}
                        >
                            {/* Synergies lead. They hold for the whole fight, so they are the stable part of
                                the row: put them after the buffs and every buff that lands or expires shifts
                                them along, and the eye has to find them again each turn. */}
                            {shownSynergies.length > 0 && (
                                <SynergiesRow
                                    synergies={shownSynergies}
                                    // Use the same authored width/height as the neighbouring buff image.
                                    // The synergy asset has no extra frame, so adding the buff border again
                                    // made its visible footprint larger than every ordinary tile.
                                    size={effectTileSize(metrics)}
                                    inline
                                />
                            )}
                            {orderedBuffs.length > 0 && (
                                <EffectTiles effects={orderedBuffs} title="Buffs" metrics={metrics} inline />
                            )}
                        </Box>
                    </IconScrollWell>
                </PanelSection>

                <PanelSection
                    title="Debuffs"
                    metrics={metrics}
                    offsetY={-Math.round(metrics.gapPx * 3)}
                    titleHeightScale={UNIT_SECTION_PLAQUE_HEIGHT_SCALE}
                >
                    <Box
                        sx={{
                            position: "relative",
                            width: "100%",
                            height: `${effectWellHeight}px`,
                            overflow: "visible",
                            // Move the complete original-size row. The scrolling/clipping viewport itself
                            // is no longer transformed, which prevents its lower edge slicing the artwork.
                            transform: "translateY(-17.5%)",
                        }}
                    >
                        <IconScrollWell height={debuffPaintWellHeight}>
                            <EffectTiles effects={debuffs} title="Debuffs" metrics={metrics} />
                        </IconScrollWell>
                    </Box>
                </PanelSection>
            </Box>
        </Box>
    );
};

const AbilityStatusOverlay: React.FC<{ isAura?: boolean; label: string; color: string }> = ({
    isAura,
    label,
    color,
}) => (
    <Box
        sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            zIndex: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: isAura ? "50%" : "15%",
            overflow: "hidden",
        }}
    >
        <Box
            sx={{
                color,
                fontWeight: "bold",
                transform: "rotate(-45deg)",
                fontSize: label === "STOLEN" ? "1em" : "1.2em",
                textShadow: "1px 1px 2px rgba(0, 0, 0, 0.5)",
                whiteSpace: "nowrap",
                userSelect: "none",
            }}
        >
            {label}
        </Box>
    </Box>
);

const UnitStatsListItemInner: React.FC<UnitStatsListItemProps> = ({ unitProperties, overallImpact, factionType }) => {
    const metrics = useSidebarMetrics();
    // The game renders dark-only; the light palette is gone, so this is a constant.
    const isDarkMode = true;
    const abilities: IVisibleImpact[] = overallImpact.abilities || [];
    const rawBuffs: IVisibleImpact[] = overallImpact.buffs || [];
    const rawDebuffs: IVisibleImpact[] = overallImpact.debuffs || [];
    // White Tiger's Disguise Aura is modelled as a pair the engine flips as enemies come and go: the
    // "Hidden" buff while nothing stands inside the aura's range, the "Visible" debuff the moment
    // something does. "Visible" is not a debuff — every stack on the board is visible to begin with, so
    // listing it reads as a penalty the tiger is under rather than as the plain default it is. It never
    // shows. The aura itself only means anything while it is actually hiding the stack, so it joins the
    // Buffs only then: a tiger standing in the open carries neither icon, and the card says what is true
    // right now instead of what the creature could do from somewhere else.
    const isHidden = rawBuffs.some((buff) => buff.name === "Hidden");
    const buffs: IVisibleImpact[] = isHidden ? rawBuffs : rawBuffs.filter((buff) => !isDisguise(buff.name));
    const debuffs: IVisibleImpact[] = rawDebuffs.filter((debuff) => debuff.name !== "Visible");
    const hasHandymanAbility = abilities.some((ability) => ability.name === "Handyman");
    const hasBreakApplied = debuffs.some((d) => d.name === "Break" && d.laps > 0);
    const onImageLoaded = useCallback(() => {}, []);

    const factionName = factionType ? ToFactionName[factionType] : "";
    const factionImageKey = factionName ? (`${factionName.toLowerCase()}_512` as ImageKey) : undefined;
    const factionSynergyGroups = factionName ? getFactionSynergyGroups(factionName) : [];

    if (factionName) {
        return (
            // @ts-ignore: MUI type mismatch
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            <ListItemContent>
                                <Typography level="title-sm">{factionName}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon />
                        </ListItemButton>
                    )}
                >
                    <List sx={{ gap: 0, p: 0 }}>
                        <Avatar
                            src={factionImageKey ? images[factionImageKey] : undefined}
                            variant="plain"
                            sx={{
                                zIndex: "modal",
                                width: "auto",
                                // The faction crest is decorative — it yields height first so the synergy
                                // ladder underneath stays whole on a short screen.
                                height: "auto",
                                maxHeight: `${metrics.portraitMax}px`,
                                overflow: "visible",
                                imageRendering: "auto",
                                transform: "translateZ(0)",
                                transition: "opacity 180ms ease-out",
                                mb: `${metrics.gapPx}px`,
                                "& img": { objectFit: "contain" },
                            }}
                        />
                        {factionSynergyGroups.length > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: `${Math.round(metrics.gapPx * 0.6)}px`,
                                    pb: `${metrics.gapPx}px`,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: `${0.78 * metrics.fontScale}rem`,
                                        fontWeight: 800,
                                        letterSpacing: 0,
                                        lineHeight: 1,
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Synergies
                                </Typography>
                                <Box
                                    sx={{
                                        display: "grid",
                                        // Two ladders side by side need ~110px each; below that they stack
                                        // instead of squeezing the labels into single letters per line.
                                        gridTemplateColumns: `repeat(${
                                            metrics.contentWidth >= 224 ? factionSynergyGroups.length : 1
                                        }, minmax(0, 1fr))`,
                                        gap: `${metrics.gapPx}px`,
                                    }}
                                >
                                    {factionSynergyGroups.map((group) => (
                                        <Box
                                            key={group[0]?.key ?? "synergy-group"}
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: `${Math.round(metrics.gapPx * 0.6)}px`,
                                                minWidth: 0,
                                            }}
                                        >
                                            {group.map((synergy) => {
                                                const imageSize = Math.round(
                                                    (26 + synergy.level * 5) * metrics.fontScale,
                                                );
                                                return (
                                                    <Tooltip
                                                        key={synergy.key}
                                                        title={getSynergyTooltip(synergy.key, synergy.level)}
                                                        placement="bottom"
                                                        sx={commonTooltipSx}
                                                    >
                                                        <Box
                                                            sx={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 0.75,
                                                                minWidth: 0,
                                                            }}
                                                        >
                                                            <Box
                                                                component="img"
                                                                src={
                                                                    SYNERGY_KEY_TO_IMAGE[
                                                                        synergy.key as keyof typeof SYNERGY_KEY_TO_IMAGE
                                                                    ]
                                                                }
                                                                sx={{
                                                                    width: `${imageSize}px`,
                                                                    height: `${imageSize}px`,
                                                                    flexShrink: 0,
                                                                    imageRendering: "auto",
                                                                    transform: "translateZ(0)",
                                                                }}
                                                            />
                                                            <Box sx={{ minWidth: 0 }}>
                                                                <Typography
                                                                    sx={{
                                                                        fontSize: `${0.72 * metrics.fontScale}rem`,
                                                                        fontWeight: 700,
                                                                        lineHeight: 1.05,
                                                                        overflowWrap: "anywhere",
                                                                    }}
                                                                >
                                                                    {synergy.label}
                                                                </Typography>
                                                                <Typography
                                                                    sx={{
                                                                        color: "text.tertiary",
                                                                        fontSize: `${0.64 * metrics.fontScale}rem`,
                                                                        lineHeight: 1.1,
                                                                    }}
                                                                >
                                                                    {FACTION_SYNERGY_LEVEL_TO_UNITS[synergy.level]}{" "}
                                                                    units
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                    </Tooltip>
                                                );
                                            })}
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        )}
                    </List>
                </Toggler>
            </ListItem>
        );
    }

    if (unitProperties && Object.keys(unitProperties).length) {
        const damageRange = `${formatSidebarStat(unitProperties.attack_damage_min)} - ${formatSidebarStat(unitProperties.attack_damage_max)}`;
        const stepsMod = unitProperties.steps_mod;
        const attackTypeSelected = unitProperties.attack_type_selected;

        let attackDamage = (unitProperties.base_attack + unitProperties.attack_mod) * unitProperties.attack_multiplier;
        if (
            attackTypeSelected === AttackVals.MELEE &&
            unitProperties.attack_type === AttackVals.RANGE &&
            !hasHandymanAbility
        )
            attackDamage /= 2;

        const meleeArmor = Math.max(1, unitProperties.base_armor + unitProperties.armor_mod);
        const rangeArmor = Math.max(1, unitProperties.range_armor + unitProperties.armor_mod);
        const hasDifferentRangeArmor = meleeArmor !== rangeArmor;

        const largeTextureName = unitProperties.large_texture_name;

        return (
            // @ts-ignore: MUI type mismatch
            <ListItem
                style={{ "--List-nestedInsetStart": "0px" }}
                sx={{ display: "block", width: "100%", height: "100%", minHeight: 0, p: 0 }}
                nested
            >
                <Box sx={unitDetailsShellSx(metrics)}>
                    {/* The creature name uses the same plaque as Abilities / Buffs / Debuffs. The wrapper
                        only positions that shared component over the team flag; it adds no second surface. */}
                    <Box
                        sx={{
                            // Centred in the cloth between the crossbar and the crest — the run down from the
                            // pole and the run on to the portrait match. The banner is already flush with the top
                            // of the screen, so this room comes out of the card, not out of a further lift.
                            mt: `${bannerLayout(metrics).above}px`,
                            mb: `${bannerLayout(metrics).below}px`,
                            position: "relative",
                            // Like the Abilities divider, the creature-name plaque remains readable above
                            // the full-viewport portrait layer.
                            zIndex: 6,
                            width: "100%",
                            // Cancel the authored pad and the sidebar's measured top inset. The upper rail
                            // then shares the exact screen-space edge of the roster collapse control at
                            // every responsive density, without relying on a guessed pixel offset.
                            transform: `translateY(calc(${-bannerLayout(metrics).above}px - var(--sidebar-card-top-inset, 0px)))`,
                            // A restrained finishing rail closes the card above the name plaque without
                            // crossing the plaque or stealing any room from the portrait.
                            "&::before": {
                                content: '""',
                                position: "absolute",
                                // Share the plaque's upper edge instead of floating above it. This keeps the
                                // requested line visible even when the card begins at the top of the screen.
                                top: 0,
                                left: "1.5%",
                                right: "1.5%",
                                height: "1px",
                                background:
                                    "linear-gradient(90deg, transparent 0%, rgba(116,77,42,.72) 5%, rgba(203,159,92,.72) 50%, rgba(116,77,42,.72) 95%, transparent 100%)",
                                boxShadow: "0 1px 0 rgba(0,0,0,.7)",
                                pointerEvents: "none",
                            },
                        }}
                    >
                        <SectionTitle
                            title={unitProperties.name.toUpperCase()}
                            metrics={metrics}
                            displayFont
                            preserveCase
                            namePlaque
                        />
                    </Box>
                    <List sx={{ p: 0, gap: 0, flex: 1, minHeight: 0 }}>
                        <UnitStatsLayout
                            unitProperties={unitProperties}
                            damageRange={damageRange}
                            attackTypeSelected={attackTypeSelected}
                            attackDamage={attackDamage}
                            meleeArmor={meleeArmor}
                            rangeArmor={rangeArmor}
                            stepsMod={stepsMod}
                            hasDifferentRangeArmor={hasDifferentRangeArmor}
                            isDarkMode={isDarkMode}
                            metrics={metrics}
                            largeTextureName={largeTextureName}
                            images={images}
                            onImageLoaded={onImageLoaded}
                            abilities={abilities}
                            buffs={buffs}
                            debuffs={debuffs}
                            hasBreakApplied={hasBreakApplied}
                            team={unitProperties.team}
                        />
                    </List>
                </Box>
            </ListItem>
        );
    }
    return <ListItem nested />;
};

export const UnitStatsListItem = React.memo(UnitStatsListItemInner, areUnitStatsPropsEqual);
