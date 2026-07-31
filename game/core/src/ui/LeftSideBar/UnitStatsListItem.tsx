import {
    HoCConfig,
    HoCConstants,
    UnitProperties,
    AttackVals,
    MovementVals,
    TeamVals,
    HoCLib,
    AttackType,
    FactionType,
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
import React, { useCallback } from "react";

import { animationAtlases, AnimationUnitName, AnimationStateName } from "../../generated/animation_atlases";
import { images, type ImageKey } from "../../generated/image_imports";
import { buildAtlasPingPongTiming } from "../../scenes/atlasAnimationTiming";
import { IVisibleImpact, IVisibleOverallImpact } from "../../scenes/VisibleState";
import SynergiesRow from "./SynergiesRow";
import { ArrowShieldIcon } from "../svg/arrow_shield";
import { BootIcon } from "../svg/boot";
import { BowIcon } from "../svg/bow";
import { FistIcon } from "../svg/fist";
import { HeartIcon } from "../svg/heart";
import { LuckIcon } from "../svg/luck";
import { MagicShieldIcon } from "../svg/magic_shield";
import { MoraleIcon } from "../svg/morale";
import { QuiverIcon } from "../svg/quiver";
import { ShieldIcon } from "../svg/shield";
import { ScrollIcon } from "../svg/scroll";
import { ShotRangeIcon } from "../svg/shot_range";
import { SpeedIcon } from "../svg/speed";
import { SwordIcon } from "../svg/sword";
import { WingIcon } from "../svg/wing";
import Toggler from "../Toggler";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";
import { useSidebarMetrics, type ISidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";
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

type AtlasMeta = (typeof animationAtlases)[AnimationUnitName][AnimationStateName];

function getDefaultAnimationConfig(unitName?: string | null): { meta: AtlasMeta; imageSrc: string } | null {
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const unitStates = animationAtlases[normalized];
    const stateNames = Object.keys(unitStates) as AnimationStateName[];
    if (!stateNames.length) return null;
    const preferredState = (stateNames as string[]).includes("default")
        ? ("default" as AnimationStateName)
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
            flexWrap="wrap"
            sx={{ width: "100%", gap: `${metrics.gapPx}px`, marginTop: `${Math.round(metrics.gapPx * 0.6)}px` }}
        >
            {filtered.map((ability, index) => (
                <AbilityCell
                    key={`${ability.name}-${ability.smallTextureName}-${index}`}
                    ability={ability}
                    teamType={teamType}
                    size={metrics.abilityCell}
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
    borderRadius: "8px",
    background: "linear-gradient(180deg, rgba(38,26,14,.92), rgba(16,11,6,.94))",
    border: "2px solid #100b07",
    boxShadow: "inset 0 0 0 1px rgba(150,130,98,.16), inset 0 2px 10px rgba(0,0,0,.75), 0 2px 6px rgba(0,0,0,.6)",
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

// A constant-height well. Whatever the unit carries — one ability or nine buffs — the block occupies the
// same space and the overflow scrolls, so the card's geometry never depends on the creature.
const ScrollWell: React.FC<{ height: number; children: React.ReactNode }> = ({ height, children }) => (
    <Box sx={{ height: `${height}px`, overflowY: "auto", overflowX: "hidden", pr: "2px", ...hocScrollSx }}>
        {children}
    </Box>
);

// Section caption + the 2px rule under it. Used for Abilities / Buffs / Debuffs here and for Up next in
// the sidebar itself, so all four headings read as one family.
export const SectionTitle: React.FC<{ title: string; metrics: ISidebarMetrics }> = ({ title, metrics }) => (
    <Box sx={{ width: "100%" }}>
        <Typography
            level="title-sm"
            sx={{
                fontSize: `${metrics.sectionTitleRem}rem`,
                fontWeight: 800,
                lineHeight: 1.2,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#dcb158",
                textShadow: "0 1px 0 rgba(0,0,0,.8)",
            }}
        >
            {title}
        </Typography>
        <Box
            sx={{
                height: "2px",
                mt: "2px",
                background: "linear-gradient(90deg, rgba(120,104,80,.5), transparent)",
            }}
        />
    </Box>
);

const PanelSection: React.FC<{
    title: string;
    metrics: ISidebarMetrics;
    children: React.ReactNode;
}> = ({ title, metrics, children }) => (
    <Box
        sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: `${Math.max(2, Math.round(metrics.gapPx * 0.4))}px`,
        }}
    >
        <SectionTitle title={title} metrics={metrics} />
        {children}
    </Box>
);

// Just the tiles. Split out of EffectRow so the Buffs section can put buff tiles and synergy badges under
// a single caption.
const EffectTiles: React.FC<{
    effects: IVisibleImpact[];
    title: string;
    metrics: ISidebarMetrics;
}> = ({ effects, title, metrics }) => {
    if (!effects.length) return null;

    return (
        <>
            <Box sx={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: `${metrics.gapPx * 0.6}px` }}>
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
                                width: `${metrics.effectIcon}px`,
                                height: `${metrics.effectIcon}px`,
                                flex: "none",
                                // Same tile frame as the ability cells — see the handoff.
                                borderRadius: effect.isAura ? "50%" : "15%",
                                border: "2px solid #0d0906",
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
// Gold-friendly green/red for a modified stat: bright enough to read against the dark plate without
// fighting the parchment numbers around them.
const MOD_UP_COLOR = "#7ee787";
const MOD_DOWN_COLOR = "#ff8a7a";

/**
 * The signed delta a buff/debuff applied, as the text shown beside the stat -- "+2", "-1".
 *
 * The AMOUNT is the point: the number displayed is already the modified one, so a tint alone tells you
 * something changed but not what it cost. Empty when the stat is at its base, so unmodified stats stay
 * plain parchment.
 */
const modLabel = (delta: number): string => (delta ? `${delta > 0 ? "+" : ""}${Number(delta.toFixed(2))}` : "");

const StatValue = React.forwardRef<
    HTMLDivElement,
    {
        icon: React.ReactElement<Record<string, unknown>>;
        value: string | number;
        color: string;
        metrics: ISidebarMetrics;
        /** Signed delta text ("+2", "-1"); empty when the stat is at its base value. */
        modifier?: string;
    } & React.HTMLAttributes<HTMLDivElement>
>(({ icon, value, color, metrics, modifier, ...tooltipProps }, ref) => (
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
            fontSize={`${metrics.statFontRem}rem`}
            component="span"
            sx={{
                whiteSpace: "nowrap",
                // A buffed or debuffed stat is TINTED, and carries a small caret. The rebuild dropped the
                // old treatment -- a pulsing green/red ring around the whole cell -- because on a creature
                // with a permanent modifier it sat on screen all fight and read as clutter. The
                // information still matters, so it moves onto the number itself: no animation, no extra
                // chrome, and the caret keeps it readable without relying on colour alone.
            }}
        >
            {value}
            {modifier && (
                <Box
                    component="span"
                    sx={{
                        fontSize: "0.78em",
                        ml: "2px",
                        fontWeight: 700,
                        color: modifier.startsWith("-") ? MOD_DOWN_COLOR : MOD_UP_COLOR,
                    }}
                >
                    {modifier}
                </Box>
            )}
        </Typography>
    </Box>
));
StatValue.displayName = "StatValue";

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
    modifier?: string;
    secondModifier?: string;
}> = ({
    icon,
    value,
    tooltip,
    color,
    metrics,
    secondIcon,
    secondValue,
    secondColor,
    secondTooltip,
    modifier,
    secondModifier,
}) => {
    const first = <StatValue icon={icon} value={value} color={color} metrics={metrics} modifier={modifier} />;

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "nowrap",
                overflow: "hidden",
                minWidth: 0,
                gap: "4px",
                // Per the handoff each stat sits in its own shallow recess inside the stone plate. Every
                // cell is one grid track wide, so the block is the same three-up shape for every creature.
                padding: "3px 6px",
                borderRadius: "5px",
                background: "rgba(0,0,0,.32)",
                boxShadow: "inset 0 0 0 1px rgba(150,130,98,.14)",
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
                        modifier={secondModifier}
                    />
                </Tooltip>
            )}
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
    // magic_resist_mod and range_shots_mod REPLACE their base rather than adding to it (Enchanted Skin
    // sets the resist outright), so the delta has to be computed against the base instead of printed
    // straight -- "+40" would be wrong for a mod that means "40 total".
    const magicResistDelta = unitProperties.magic_resist_mod
        ? Math.round(unitProperties.magic_resist_mod) - Math.round(unitProperties.magic_resist)
        : 0;
    const rangeShotsDelta = unitProperties.range_shots_mod
        ? Math.round(unitProperties.range_shots_mod) - Math.round(unitProperties.range_shots)
        : 0;

    // Additive first, then the multiplier — the same order and shape mainline used.
    const attackModifierLabel = [
        modLabel(unitProperties.attack_mod),
        unitProperties.attack_multiplier !== 1 ? `x${Number(unitProperties.attack_multiplier.toFixed(2))}` : "",
    ]
        .filter(Boolean)
        .join(" ");

    // Luck's display delta has to be DERIVED, not read from luck_mod.
    //
    // In the sandbox luck_mod carries the buff and the delta is just that. In ranked it is hardcoded to 0:
    // the server ships luck already rolled (auras + the per-turn spread) with luck_authoritative set, so
    // adjustBaseStats keeps it verbatim. Writing the delta into luck_mod to make the HUD work would be a
    // gameplay bug, because getLuck() sums luck + luck_mod -- it would inflate real damage rolls and
    // ability chances, not just this label. So the effective total is diffed against the creature's
    // configured base instead, which is display-only and correct on both paths.
    const configuredLuck = HoCConfig.getCreatureConfig(
        unitProperties.team,
        ToFactionName[unitProperties.faction],
        unitProperties.name,
        unitProperties.large_texture_name,
        0,
    ).luck;
    const luckDelta = Math.round(unitProperties.luck + unitProperties.luck_mod) - Math.round(configuredLuck);
    const animationConfig = getDefaultAnimationConfig(unitProperties.name);
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
                value={`${Math.round(unitProperties.hp)}/${Math.round(unitProperties.max_hp)}`}
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
                value={Math.round(attackDamage)}
                // Attack carries TWO kinds of modifier and both have to show. Mass Riot (and Weakness,
                // Fireforged Sword, Warlord's Edge...) move attack_mod, which is ADDITIVE and already folded
                // into the number above -- so without printing it the buff simply disappeared into the stat.
                // attack_multiplier is separate and multiplicative. Mainline printed both, e.g. "+5 x1.5".
                modifier={attackModifierLabel}
                tooltip="Attack type and multiplier"
                color={attackTypeSelected === AttackVals.RANGE ? "#ffd700" : "#a52a2a"}
                metrics={metrics}
            />
            <StatItem
                icon={<ShieldIcon />}
                value={Math.round(meleeArmor)}
                tooltip={hasDifferentRangeArmor ? "Armor against melee attacks" : "Armor"}
                color="#4682b4"
                metrics={metrics}
                modifier={modLabel(unitProperties.armor_mod)}
                secondModifier={modLabel(unitProperties.armor_mod)}
                // A creature that armours differently against arrows shows both figures in ONE cell, the
                // way morale and luck share theirs. They are the same stat read against two attack types,
                // so splitting them across the grid made the pair read as unrelated -- and the second cell
                // only existed for some creatures, which shifted every stat after it.
                secondIcon={hasDifferentRangeArmor ? <ArrowShieldIcon /> : undefined}
                secondValue={hasDifferentRangeArmor ? Math.round(rangeArmor) : undefined}
                secondColor="#f4a460"
                secondTooltip="Armor against ranged attacks"
            />
            <StatItem
                icon={<MagicShieldIcon />}
                value={`${Math.round(unitProperties.magic_resist_mod || unitProperties.magic_resist)}%`}
                modifier={modLabel(magicResistDelta)}
                tooltip="Magic resist in %"
                color="#8a2be2"
                metrics={metrics}
            />
            {/* Movement range and initiative share a cell: both answer "how does this stack move through
                the turn", and pairing them keeps the plate at seven fixed slots. */}
            <StatItem
                icon={unitProperties.movement_type === MovementVals.FLY ? <WingIcon /> : <BootIcon />}
                value={Math.floor(unitProperties.steps + stepsMod)}
                modifier={modLabel(stepsMod)}
                tooltip="Movement type and number of steps in cells"
                color={unitProperties.movement_type === MovementVals.FLY ? "#00ff7f" : "#8b4513"}
                metrics={metrics}
                secondIcon={<SpeedIcon />}
                secondValue={Math.round(unitProperties.speed)}
                secondColor={isDarkMode ? "#f5fefd" : "#000000"}
                secondTooltip="Units with higher speed turn first"
            />
            {/* Morale and luck share one cell. They are the two smallest, most closely related numbers, and
                pairing them buys back a slot — a ranged creature carries enough extra stats to spill onto a
                fourth row otherwise, which moved everything below the plate. */}
            <StatItem
                icon={<MoraleIcon />}
                value={Math.round(unitProperties.morale)}
                secondModifier={modLabel(luckDelta)}
                tooltip="Morale grants extra actions, and adds movement steps once the map starts narrowing"
                color={isDarkMode ? "#ffff00" : "#DC4D01"}
                metrics={metrics}
                secondIcon={<LuckIcon />}
                secondValue={Math.round(unitProperties.luck + unitProperties.luck_mod)}
                secondColor="#ff4040"
                secondTooltip="Luck raises damage rolls and the power of abilities"
            />
            {/* Spellbook scroll count. Dropped in the sidebar rebuild -- it is the only readout of how many
                casts a spellcaster has left, so losing it meant checking the spellbook to answer a question
                the stat block used to answer at a glance. */}
            {unitProperties.can_cast_spells && (
                <StatItem
                    icon={<ScrollIcon />}
                    value={unitProperties.spells.length}
                    tooltip="Magic scrolls left to cast"
                    color="#add8e6"
                    metrics={metrics}
                />
            )}
            {showRangedStats && (
                <StatItem
                    icon={<ShotRangeIcon />}
                    value={Math.round(unitProperties.shot_distance)}
                    tooltip="Ranged shot distance in cells"
                    color="#ffff00"
                    metrics={metrics}
                />
            )}
            {showRangedStats && !!(unitProperties.range_shots_mod || unitProperties.range_shots) && (
                <StatItem
                    icon={<QuiverIcon />}
                    value={unitProperties.range_shots_mod || unitProperties.range_shots}
                    modifier={modLabel(rangeShotsDelta)}
                    tooltip="Number of ranged shots"
                    color="#cd5c5c"
                    metrics={metrics}
                />
            )}
        </>
    );
    const unitSynergies = ((unitProperties as UnitProperties).synergies as string[]) ?? [];
    // Three stat rows, always — the well below scrolls if a creature carries more than nine.
    const statRowHeight = Math.round(metrics.statIconPx + 12);
    const statWellHeight = statRowHeight * 3 + STAT_ROW_GAP * 2;
    // One row of tiles each; anything beyond that scrolls inside the well rather than growing the card.
    const abilityWellHeight = metrics.abilityCell + 6;
    const effectWellHeight = metrics.effectIcon + 6;
    // A blurred layer paints well outside its own box — roughly one blur radius in every direction — and
    // that overspill is what the bar's `overflowX: hidden` was slicing into a visible edge. So each layer
    // is sized as (bar width - 2x its own blur), which makes it fade to nothing before it ever reaches the
    // panel edge. The portrait then matches the innermost layer, so the glow reads as a ring around it.
    const flameBlur = { outer: 26, mid: 18, inner: 12 };
    const flameWidth = {
        outer: Math.max(80, metrics.contentWidth - flameBlur.outer * 2),
        mid: Math.max(70, metrics.contentWidth - flameBlur.mid * 2 - 26),
        inner: Math.max(60, metrics.contentWidth - flameBlur.inner * 2 - 52),
    };
    const portraitBox = Math.round(Math.min(metrics.portraitMax, flameWidth.inner));

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
            {/* Portrait on top, stats under it. The portrait is the only block allowed to flex: the stat
                plate and the three wells below have fixed heights, so it absorbs whatever the screen has
                left. That keeps the card identical from creature to creature — only the screen changes it. */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: `${Math.round(metrics.gapPx * 0.5)}px`,
                    width: "100%",
                    flex: "0 1 auto",
                    minHeight: 0,
                }}
            >
                <Box
                    sx={{
                        width: "100%",
                        flex: "0 1 auto",
                        minHeight: 0,
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
                        height: `${portraitBox}px`,
                        overflow: "visible",
                        ...teamAuraKeyframes,
                    }}
                >
                    {/* Synergies sit in the portrait block's top-left corner as a column, not as a section
                        of their own. They are a standing property of the army rather than an effect on this
                        stack, so they read better as a quiet marker beside the art than as a titled band
                        competing with Buffs and Debuffs for the card's vertical space. */}
                    {unitSynergies.length > 0 && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                zIndex: 2,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: `${Math.round(metrics.gapPx * 0.4)}px`,
                                pointerEvents: "auto",
                            }}
                        >
                            <SynergiesRow synergies={unitSynergies} column />
                        </Box>
                    )}

                    <Box
                        sx={{
                            // No circular clip and no frame: the art keeps its own silhouette, so wings,
                            // weapons and limbs that hang outside the portrait's box still show. The flame
                            // simply burns behind it.
                            position: "relative",
                            zIndex: 1,
                            width: `${portraitBox}px`,
                            maxWidth: "100%",
                            maxHeight: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {animationConfig ? (
                            <AtlasAnimation
                                meta={animationConfig.meta}
                                src={animationConfig.imageSrc}
                                onLoaded={onImageLoaded}
                                maxHeight={portraitBox}
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
                </Box>
                <Box sx={{ flex: "none", minWidth: 0, ...stonePlateSx }}>
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

            {/* All three blocks are always rendered at a constant height, empty or not, so the card is the
                same shape for every creature and nothing below it ever moves. */}
            <PanelSection title="Abilities" metrics={metrics}>
                <ScrollWell height={abilityWellHeight}>
                    <AbilityStack
                        abilities={abilities}
                        teamType={team}
                        metrics={metrics}
                        hasBreakApplied={hasBreakApplied}
                    />
                </ScrollWell>
            </PanelSection>

            <PanelSection title="Buffs" metrics={metrics}>
                <ScrollWell height={effectWellHeight}>
                    {buffs.length > 0 && <EffectTiles effects={buffs} title="Buffs" metrics={metrics} />}
                </ScrollWell>
            </PanelSection>

            <PanelSection title="Debuffs" metrics={metrics}>
                <ScrollWell height={effectWellHeight}>
                    <EffectTiles effects={debuffs} title="Debuffs" metrics={metrics} />
                </ScrollWell>
            </PanelSection>
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

type UnitStatsListItemProps = {
    unitProperties: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const UnitStatsListItemInner: React.FC<UnitStatsListItemProps> = ({ unitProperties, overallImpact, factionType }) => {
    const metrics = useSidebarMetrics();
    // The game renders dark-only; the light palette is gone, so this is a constant.
    const isDarkMode = true;
    const abilities: IVisibleImpact[] = overallImpact.abilities || [];
    const buffs: IVisibleImpact[] = overallImpact.buffs || [];
    const debuffs: IVisibleImpact[] = overallImpact.debuffs || [];
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
        const stackName = `${unitProperties.name} x${unitProperties.amount_alive}`;
        const damageRange = `${Math.round(unitProperties.attack_damage_min)} - ${Math.round(unitProperties.attack_damage_max)}`;
        const stepsMod = Number(unitProperties.steps_mod.toFixed(1));
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
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                {/* Plain headline: no team crest (the portrait's aura carries the side) and no collapse
                    chevron — the stats are the point of the card, so they are always open. */}
                <Typography
                    level="title-sm"
                    sx={{
                        fontSize: `${1.02 * metrics.fontScale}rem`,
                        fontWeight: 800,
                        letterSpacing: "0.03em",
                        lineHeight: 1.2,
                        color: "#f2e3c0",
                        textShadow: "0 1px 0 rgba(0,0,0,.85)",
                        textAlign: "center",
                        px: 0,
                        pt: "2px",
                    }}
                >
                    {stackName}
                </Typography>
                <List sx={{ p: 0, gap: 0 }}>
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
            </ListItem>
        );
    }
    return <ListItem nested />;
};

const arePropsEqual = (prev: UnitStatsListItemProps, next: UnitStatsListItemProps) => {
    if (prev.factionType !== next.factionType) return false;
    const pUnit = prev.unitProperties;
    const nUnit = next.unitProperties;
    if (pUnit === nUnit) return true;
    if (!pUnit || !nUnit) return false;
    if (
        pUnit.id !== nUnit.id ||
        pUnit.amount_alive !== nUnit.amount_alive ||
        pUnit.hp !== nUnit.hp ||
        pUnit.steps !== nUnit.steps ||
        pUnit.name !== nUnit.name
    )
        return false;
    if (
        pUnit.attack_mod !== nUnit.attack_mod ||
        pUnit.attack_multiplier !== nUnit.attack_multiplier ||
        pUnit.armor_mod !== nUnit.armor_mod ||
        pUnit.steps_mod !== nUnit.steps_mod ||
        pUnit.luck_mod !== nUnit.luck_mod ||
        pUnit.range_shots_mod !== nUnit.range_shots_mod ||
        pUnit.magic_resist_mod !== nUnit.magic_resist_mod
    )
        return false;
    if (prev.overallImpact !== next.overallImpact) return false;
    return true;
};

export const UnitStatsListItem = React.memo(UnitStatsListItemInner, arePropsEqual);
