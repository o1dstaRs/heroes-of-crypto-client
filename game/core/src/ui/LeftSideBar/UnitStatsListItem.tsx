import {
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
import { useTheme } from "@mui/joy/styles";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useCallback } from "react";

import { animationAtlases, AnimationUnitName, AnimationStateName } from "../../generated/animation_atlases";
import { images, type ImageKey } from "../../generated/image_imports";
import { buildAtlasPingPongTiming } from "../../scenes/atlasAnimationTiming";
import { IVisibleImpact, IVisibleOverallImpact } from "../../scenes/VisibleState";
import { ArrowShieldIcon } from "../svg/arrow_shield";
import { BootIcon } from "../svg/boot";
import { BowIcon } from "../svg/bow";
import { FistIcon } from "../svg/fist";
import { HeartIcon } from "../svg/heart";
import { LuckIcon } from "../svg/luck";
import { MagicShieldIcon } from "../svg/magic_shield";
import { MoraleIcon } from "../svg/morale";
import { QuiverIcon } from "../svg/quiver";
import { ScrollIcon } from "../svg/scroll";
import { ShieldIcon } from "../svg/shield";
import { ShotRangeIcon } from "../svg/shot_range";
import { SpeedIcon } from "../svg/speed";
import { SwordIcon } from "../svg/sword";
import { GreenUserIcon } from "../svg/user_green";
import { RedUserIcon } from "../svg/user_red";
import { GrayUserIcon } from "../svg/user_gray";
import { WingIcon } from "../svg/wing";
import Toggler from "../Toggler";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";

interface IAbilityStackProps {
    abilities: IVisibleImpact[];
    teamType: TeamType;
}

const commonTooltipSx = {
    backgroundColor: "#2d1606",
    border: "2px solid #dcb158",
    color: "#efe4cc",
    borderRadius: "8px",
    boxShadow: "0 6px 12px rgba(0,0,0,0.8)",
    fontSize: "0.85rem",
    fontWeight: 500,
    maxWidth: "280px",
    zIndex: 10000,
};

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
}> = ({ meta, src, onLoaded }) => {
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

const AbilityCell: React.FC<{
    ability: IVisibleImpact;
    teamType: TeamType;
    isWidescreen: boolean;
    hasBreakApplied: boolean;
}> = ({ ability, teamType, isWidescreen, hasBreakApplied }) => {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";
    const auraColor = isDarkMode ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.75)";

    // The stack-power pips and break overlay are pure CSS, so they'd otherwise pop in before the
    // ability image finishes loading (the pips visibly racing ahead). Gate them — and fade the image
    // in — on the image's load so everything appears together.
    const [loaded, setLoaded] = React.useState(false);
    const setImgRef = React.useCallback((node: HTMLImageElement | null) => {
        // A cached image can already be complete before onLoad attaches — reconcile on mount.
        if (node?.complete && node.naturalWidth > 0) {
            setLoaded(true);
        }
    }, []);

    return (
        <Tooltip
            title={
                <>
                    {hasBreakApplied && "BREAK APPLIED!\n"}
                    {ability.name}:&nbsp;
                    {ability.description.split("\n").map((line, idx) => (
                        <React.Fragment key={idx}>
                            {line}
                            <br />
                        </React.Fragment>
                    ))}
                </>
            }
            sx={commonTooltipSx}
        >
            <Box
                sx={{
                    position: "relative",
                    width: isWidescreen ? "22%" : `calc((100% - ${theme.spacing(3)}) / 3)`,
                    paddingBottom: isWidescreen ? "22%" : `calc((100% - ${theme.spacing(3)}) / 3)`,
                    overflow: "visible",
                    borderRadius: ability.isAura ? "50%" : "15%",
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
                    onLoad={() => setLoaded(true)}
                    onError={() => setLoaded(true)}
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
                {loaded && hasBreakApplied && <BreakOverlay isAura={ability.isAura} />}
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

const AbilityStack: React.FC<IAbilityStackProps & { isWidescreen: boolean; hasBreakApplied: boolean }> = ({
    abilities,
    teamType,
    isWidescreen,
    hasBreakApplied,
}) => {
    const filtered = abilities.filter((ability) => ability.laps > 0);

    return (
        <Stack direction="row" flexWrap="wrap" gap={isWidescreen ? 2 : 1.5} sx={{ width: "100%", marginTop: 1 }}>
            {filtered.map((ability, index) => (
                <AbilityCell
                    key={`${ability.name}-${ability.smallTextureName}-${index}`}
                    ability={ability}
                    teamType={teamType}
                    isWidescreen={isWidescreen}
                    hasBreakApplied={hasBreakApplied}
                />
            ))}
        </Stack>
    );
};

const EffectColumnOrRow: React.FC<{
    effects: IVisibleImpact[];
    title: string;
    isHorizontalLayout?: boolean;
}> = ({ effects, title, isHorizontalLayout = false }) => {
    if (!effects.length) return <Box sx={{ marginBottom: 2 }} />;

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                alignItems: isHorizontalLayout ? "left" : "center",
                marginBottom: title === "Debuffs" ? 2 : 0,
                ...(isHorizontalLayout ? {} : { paddingLeft: "2px" }),
            }}
        >
            <Typography
                level="title-sm"
                sx={{
                    textAlign: isHorizontalLayout ? "left" : "center",
                    ...(isHorizontalLayout ? {} : { fontSize: 9 }),
                    width: "8ch",
                    marginBottom: isHorizontalLayout ? 1 : 0,
                    ...(isHorizontalLayout ? { marginTop: 2 } : {}),
                }}
            >
                {title}
            </Typography>
            <Box
                sx={{
                    flex: 1,
                    overflow: "auto",
                    display: "flex",
                    flexDirection: isHorizontalLayout ? "row" : "column",
                    flexWrap: isHorizontalLayout ? "wrap" : "nowrap",
                }}
            >
                {effects.map((effect, index) => (
                    <Tooltip
                        key={`${title}-${effect.name}-${effect.smallTextureName}-${index}`}
                        title={`${effect.name}: ${effect.description.substring(0, effect.description.length - 1)}${effect.laps > 0 && effect.laps !== Number.MAX_SAFE_INTEGER && effect.laps !== HoCConstants.NUMBER_OF_LAPS_TOTAL ? ` (remaining ${HoCLib.getLapString(effect.laps)})` : ""}`}
                        sx={commonTooltipSx}
                    >
                        <Box
                            component="img"
                            // @ts-ignore: images index signature
                            src={images[effect.smallTextureName]}
                            sx={{
                                width: isHorizontalLayout ? "13%" : "auto",
                                maxWidth: "100%",
                                height: "auto",
                                aspectRatio: "1",
                                objectFit: "contain",
                                zIndex: 3,
                                margin: isHorizontalLayout && index !== 0 ? "0 2px" : "1px",
                                imageRendering: "auto",
                                transform: "translateZ(0)",
                                transition: "opacity 160ms ease-out, transform 160ms ease-out",
                                willChange: "opacity, transform",
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
};

const StatGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", gap: 0.5, mb: 1 }}>{children}</Box>
);

const StatItem: React.FC<{
    icon: React.ReactElement;
    value: string | number;
    tooltip: string;
    color: string;
    badgeContent?: string;
    badgeColor?: string;
    positiveFrame?: boolean;
    negativeFrame?: boolean;
}> = ({ icon, value, tooltip, color, badgeContent, badgeColor, positiveFrame, negativeFrame }) => {
    const framed = Boolean(positiveFrame || negativeFrame);
    // Accent reuses the modifier-chip palette: green for a buff, red for a debuff.
    const accent = positiveFrame ? "22, 163, 74" : "220, 38, 38";
    const pulseName = positiveFrame ? "hocStatPulseUp" : "hocStatPulseDown";

    return (
        <Tooltip title={tooltip} sx={commonTooltipSx}>
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    overflow: "visible",
                    // A stat with an active modifier (badge) needs room for the modifier chip — give it
                    // the whole row instead of 45%, so "30 +10" always fits regardless of screen width.
                    minWidth: badgeContent ? "100%" : "45%",
                }}
            >
                {/* The highlight hugs only the icon + value + modifier chip (not the whole row) and
                    softly pulses, so an active buff/debuff reads as a tight, accurate accent rather
                    than a long fuzzy bar. */}
                <Box
                    sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        width: "fit-content",
                        ...(framed
                            ? {
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: "9px",
                                  border: `1.5px solid rgba(${accent}, 0.85)`,
                                  backgroundColor: `rgba(${accent}, 0.14)`,
                                  animation: `${pulseName} 1.6s ease-in-out infinite`,
                                  [`@keyframes ${pulseName}`]: {
                                      "0%, 100%": { boxShadow: `0 0 0 0 rgba(${accent}, 0)` },
                                      "50%": { boxShadow: `0 0 0 3px rgba(${accent}, 0.35)` },
                                  },
                                  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                              }
                            : {}),
                    }}
                >
                    {React.cloneElement(icon, { sx: { color, fontSize: "1.25rem", pr: "4px" } })}
                    <Typography
                        fontSize="0.75rem"
                        component="span"
                        sx={{
                            whiteSpace: "nowrap",
                            ...(framed ? { fontWeight: "bold" } : {}),
                        }}
                    >
                        {value}
                    </Typography>
                    {badgeContent && (
                        <Typography
                            component="span"
                            sx={{
                                fontSize: "0.62rem",
                                fontWeight: "bold",
                                lineHeight: 1,
                                px: "4px",
                                py: "1px",
                                ml: 0.5,
                                borderRadius: "8px",
                                color: "#fff",
                                whiteSpace: "nowrap",
                                backgroundColor:
                                    badgeColor === "success"
                                        ? "rgba(22, 163, 74, 0.9)"
                                        : badgeColor === "danger"
                                          ? "rgba(220, 38, 38, 0.9)"
                                          : badgeColor === "warning"
                                            ? "rgba(217, 119, 6, 0.9)"
                                            : "rgba(37, 99, 235, 0.9)",
                                border: "1px solid rgba(0,0,0,0.45)",
                            }}
                        >
                            {badgeContent}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Tooltip>
    );
};

const UnitStatsLayout: React.FC<{
    unitProperties: UnitProperties;
    damageRange: string;
    attackTypeSelected: AttackType;
    attackDamage: number;
    attackMod: number;
    meleeArmor: number;
    rangeArmor: number;
    armorMod: number;
    stepsMod: number;
    hasDifferentRangeArmor: boolean;
    isDarkMode: boolean;
    columnize: boolean;
    largeTextureName: string;
    images: { [key: string]: string };
    showStats: boolean;
    showAbilities: boolean;
    onImageLoaded: () => void;
    abilities: IVisibleImpact[];
    hasBreakApplied: boolean;
    team: TeamType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sx?: any;
}> = ({
    unitProperties,
    damageRange,
    attackTypeSelected,
    attackDamage,
    attackMod,
    meleeArmor,
    rangeArmor,
    armorMod,
    stepsMod,
    hasDifferentRangeArmor,
    isDarkMode,
    columnize,
    largeTextureName,
    images,
    showStats,
    showAbilities,
    onImageLoaded,
    abilities,
    hasBreakApplied,
    team,
    sx,
}) => {
    const statsVisible = showStats;
    const abilitiesVisible = showAbilities;
    const attackModBadgeValue = `${attackMod ? (attackMod > 0 ? "+" : "") + unitProperties.attack_mod : ""}${unitProperties.attack_multiplier !== 1 ? ` x${unitProperties.attack_multiplier}` : ""}`;
    const armorModBadgeValue = armorMod ? (armorMod > 0 ? "+" : "") + armorMod : "";
    const stepsModBadgeValue = stepsMod ? (stepsMod > 0 ? "+" : "") + stepsMod : "";
    const luckBadgeValue = unitProperties.luck_mod
        ? (unitProperties.luck_mod > 0 ? "+" : "") + unitProperties.luck_mod
        : "";

    let attackColor: "success" | "danger" | "primary" | "neutral" | "warning" = "success";
    if (
        unitProperties.attack_multiplier < 1 ||
        (unitProperties.attack_multiplier === 1 && unitProperties.attack_mod < 0)
    )
        attackColor = "danger";

    const animationConfig = getDefaultAnimationConfig(unitProperties.name);
    const statsContent = (
        <>
            <StatGroup>
                <StatItem
                    icon={<HeartIcon />}
                    value={`${unitProperties.hp}/${unitProperties.max_hp}`}
                    tooltip="Current/max Health Points"
                    color="#ff4d4d"
                />
                {unitProperties.can_cast_spells && (
                    <StatItem
                        icon={<ScrollIcon />}
                        value={unitProperties.spells.length}
                        tooltip="Number of magic scrolls"
                        color="#add8e6"
                    />
                )}
            </StatGroup>
            <StatGroup>
                <StatItem icon={<FistIcon />} value={damageRange} tooltip="Attack spread" color="#c0c0c0" />
                <StatItem
                    icon={attackTypeSelected === AttackVals.RANGE ? <BowIcon /> : <SwordIcon />}
                    value={Number(attackDamage.toFixed(2))}
                    tooltip="Attack type and multiplier"
                    color={attackTypeSelected === AttackVals.RANGE ? "#ffd700" : "#a52a2a"}
                    badgeContent={attackModBadgeValue}
                    badgeColor={attackColor}
                    positiveFrame={unitProperties.attack_multiplier > 1}
                    negativeFrame={unitProperties.attack_multiplier < 1}
                />
            </StatGroup>
            {unitProperties.attack_type === AttackVals.RANGE && (
                <StatGroup>
                    <StatItem
                        icon={<ShotRangeIcon />}
                        value={unitProperties.shot_distance}
                        tooltip="Ranged shot distance in cells"
                        color="#ffff00"
                    />
                    {(unitProperties.range_shots_mod || unitProperties.range_shots) && (
                        <StatItem
                            icon={<QuiverIcon />}
                            value={unitProperties.range_shots_mod || unitProperties.range_shots}
                            tooltip="Number of ranged shots"
                            color="#cd5c5c"
                        />
                    )}
                </StatGroup>
            )}
            <StatGroup>
                <StatItem
                    icon={<ShieldIcon />}
                    value={Number(meleeArmor.toFixed(2))}
                    tooltip="Armor"
                    color="#4682b4"
                    badgeContent={armorModBadgeValue}
                    badgeColor={unitProperties.armor_mod > 0 ? "success" : "danger"}
                    positiveFrame={unitProperties.armor_mod > 0}
                    negativeFrame={unitProperties.armor_mod < 0}
                />
                <StatItem
                    icon={<MagicShieldIcon />}
                    value={`${unitProperties.magic_resist_mod || unitProperties.magic_resist}%`}
                    tooltip="Magic resist in %"
                    color="#8a2be2"
                />
                {hasDifferentRangeArmor && (
                    <StatItem
                        icon={<ArrowShieldIcon />}
                        value={Number(rangeArmor.toFixed(2))}
                        tooltip="Range armor"
                        color="#f4a460"
                        badgeContent={armorModBadgeValue}
                        badgeColor={unitProperties.armor_mod > 0 ? "success" : "danger"}
                    />
                )}
            </StatGroup>
            <StatGroup>
                <StatItem
                    icon={unitProperties.movement_type === MovementVals.FLY ? <WingIcon /> : <BootIcon />}
                    value={Number((unitProperties.steps + stepsMod).toFixed(1))}
                    tooltip="Movement type and number of steps in cells"
                    color={unitProperties.movement_type === MovementVals.FLY ? "#00ff7f" : "#8b4513"}
                    badgeContent={stepsModBadgeValue}
                    badgeColor={stepsMod > 0 ? "success" : "danger"}
                    positiveFrame={stepsMod > 0}
                    negativeFrame={stepsMod < 0}
                />
                <StatItem
                    icon={<SpeedIcon />}
                    value={Number(unitProperties.speed.toFixed(2))}
                    tooltip="Units with higher speed turn first"
                    color={isDarkMode ? "#f5fefd" : "#000000"}
                />
            </StatGroup>
            <StatGroup>
                <StatItem
                    icon={<MoraleIcon />}
                    value={unitProperties.morale}
                    tooltip="Morale affects extra actions"
                    color={isDarkMode ? "#ffff00" : "#DC4D01"}
                    positiveFrame={
                        unitProperties.morale >= HoCConstants.MORALE_MAX_VALUE_TOTAL &&
                        unitProperties.attack_multiplier > 1
                    }
                    negativeFrame={
                        unitProperties.morale <= -HoCConstants.MORALE_MAX_VALUE_TOTAL &&
                        unitProperties.attack_multiplier < 1
                    }
                />
                <StatItem
                    icon={<LuckIcon />}
                    value={unitProperties.luck + unitProperties.luck_mod}
                    tooltip="Luck affects damage variance"
                    color="#ff4040"
                    badgeContent={luckBadgeValue}
                    badgeColor={unitProperties.luck_mod > 0 ? "success" : "danger"}
                    positiveFrame={unitProperties.luck + unitProperties.luck_mod >= HoCConstants.LUCK_MAX_VALUE_TOTAL}
                    negativeFrame={unitProperties.luck + unitProperties.luck_mod <= -HoCConstants.LUCK_MAX_VALUE_TOTAL}
                />
            </StatGroup>
        </>
    );

    const abilitiesBlock = (
        <Box sx={{ opacity: abilitiesVisible ? 1 : 0, transition: "opacity 150ms ease-out" }}>
            <Typography level="title-sm" sx={{ marginTop: columnize ? 1.5 : 3 }}>
                Abilities
            </Typography>
            <AbilityStack
                abilities={abilities}
                teamType={team}
                isWidescreen={columnize}
                hasBreakApplied={hasBreakApplied}
            />
        </Box>
    );

    return (
        <Box
            sx={{
                position: "relative",
                marginBottom: 1.5,
                width: "100%",
                display: columnize ? "flex" : "block",
                flexWrap: columnize ? "wrap" : "nowrap",
                ...sx,
            }}
        >
            <Box sx={{ width: columnize ? "60%" : "100%", position: "relative" }}>
                {animationConfig ? (
                    <AtlasAnimation
                        meta={animationConfig.meta}
                        src={animationConfig.imageSrc}
                        onLoaded={onImageLoaded}
                    />
                ) : (
                    <Avatar
                        // @ts-ignore: images index signature
                        src={images[largeTextureName]}
                        variant="plain"
                        sx={{
                            width: "100%",
                            height: "auto",
                            objectFit: "contain",
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
                    width: columnize ? "38%" : "90%",
                    pl: columnize ? 3 : 4,
                    pt: 1,
                    pb: 1,
                    transformOrigin: "top left",
                    opacity: statsVisible ? 1 : 0,
                    transition: "opacity 140ms ease-out, transform 140ms ease-out",
                    transform: statsVisible ? "scale(1.2)" : "scale(1.2) translateY(4px)",
                    pointerEvents: statsVisible ? "auto" : "none",
                }}
            >
                {statsContent}
            </Box>
            {abilitiesVisible && <Box sx={{ width: "100%", mt: 1 }}>{abilitiesBlock}</Box>}
        </Box>
    );
};

const BreakOverlay: React.FC<{ isAura?: boolean }> = ({ isAura }) => (
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
                color: "#ff0000",
                fontWeight: "bold",
                transform: "rotate(-45deg)",
                fontSize: "1.2em",
                textShadow: "1px 1px 2px rgba(0, 0, 0, 0.5)",
                whiteSpace: "nowrap",
                userSelect: "none",
            }}
        >
            BREAK
        </Box>
    </Box>
);

type UnitStatsListItemProps = {
    barSize: number;
    columnize: boolean;
    unitProperties: UnitProperties;
    overallImpact: IVisibleOverallImpact;
    factionType: FactionType;
};

const UnitStatsListItemInner: React.FC<UnitStatsListItemProps> = ({
    barSize,
    columnize,
    unitProperties,
    overallImpact,
    factionType,
}) => {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === "dark";
    const abilities: IVisibleImpact[] = overallImpact.abilities || [];
    const buffs: IVisibleImpact[] = overallImpact.buffs || [];
    const debuffs: IVisibleImpact[] = overallImpact.debuffs || [];
    const hasHandymanAbility = abilities.some((ability) => ability.name === "Handyman");
    const hasBuffsOrDebuffs = buffs.length > 0 || debuffs.length > 0;
    const hasBreakApplied = debuffs.some((d) => d.name === "Break" && d.laps > 0);
    const showStats = true;
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
                    <List sx={{ gap: 0 }}>
                        <Avatar
                            src={factionImageKey ? images[factionImageKey] : undefined}
                            variant="plain"
                            sx={{
                                zIndex: "modal",
                                width: "auto",
                                height: "auto",
                                overflow: "visible",
                                imageRendering: "auto",
                                transform: "translateZ(0)",
                                transition: "opacity 180ms ease-out",
                                mb: 3,
                            }}
                        />
                        {factionSynergyGroups.length > 0 && (
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 0.75,
                                    px: 0.5,
                                    pb: 1.5,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "0.78rem",
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
                                        gridTemplateColumns: `repeat(${factionSynergyGroups.length}, minmax(0, 1fr))`,
                                        gap: 1,
                                    }}
                                >
                                    {factionSynergyGroups.map((group) => (
                                        <Box
                                            key={group[0]?.key ?? "synergy-group"}
                                            sx={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 0.75,
                                                minWidth: 0,
                                            }}
                                        >
                                            {group.map((synergy) => {
                                                const imageSize = 32 + synergy.level * 6;
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
                                                                minHeight: "50px",
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
                                                                        fontSize: "0.72rem",
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
                                                                        fontSize: "0.64rem",
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
        const damageRange = `${unitProperties.attack_damage_min} - ${unitProperties.attack_damage_max}`;
        const armorMod = Number(unitProperties.armor_mod.toFixed(2));
        const stepsMod = Number(unitProperties.steps_mod.toFixed(1));
        const attackMod = Number(unitProperties.attack_mod.toFixed(2));
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
        const buffsVisible = showStats;

        return (
            // @ts-ignore: MUI type mismatch
            <ListItem style={{ "--List-nestedInsetStart": "0px" }} nested>
                <Toggler
                    renderToggle={({ open, setOpen }) => (
                        <ListItemButton onClick={() => setOpen(!open)}>
                            {!unitProperties.team ? (
                                <GrayUserIcon />
                            ) : unitProperties.team === 1 ? (
                                <RedUserIcon />
                            ) : (
                                <GreenUserIcon />
                            )}
                            <ListItemContent>
                                <Typography level="title-sm">{stackName}</Typography>
                            </ListItemContent>
                            <KeyboardArrowDownIcon />
                        </ListItemButton>
                    )}
                >
                    <List>
                        <Box
                            sx={{
                                width: "100%",
                                overflow: "visible",
                                display: "flex",
                                flexDirection: columnize ? "column" : "row",
                            }}
                        >
                            <UnitStatsLayout
                                unitProperties={unitProperties}
                                damageRange={damageRange}
                                attackTypeSelected={attackTypeSelected}
                                attackDamage={attackDamage}
                                attackMod={attackMod}
                                meleeArmor={meleeArmor}
                                rangeArmor={rangeArmor}
                                armorMod={armorMod}
                                stepsMod={stepsMod}
                                hasDifferentRangeArmor={hasDifferentRangeArmor}
                                isDarkMode={isDarkMode}
                                columnize={columnize}
                                largeTextureName={largeTextureName}
                                images={images}
                                showStats={showStats}
                                showAbilities={showStats && (columnize || !hasBuffsOrDebuffs)}
                                onImageLoaded={onImageLoaded}
                                abilities={abilities}
                                hasBreakApplied={hasBreakApplied}
                                team={unitProperties.team}
                                sx={!columnize && hasBuffsOrDebuffs ? { marginBottom: 0 } : undefined}
                            />
                            {hasBuffsOrDebuffs && !columnize && (
                                <Box
                                    sx={{
                                        width: barSize > 256 ? "20%" : "15%",
                                        display: buffsVisible ? "flex" : "none",
                                        flexDirection: "column",
                                        opacity: buffsVisible ? 1 : 0,
                                        transition: buffsVisible ? "opacity 150ms ease-out" : "none",
                                    }}
                                >
                                    {buffs.length > 0 && <EffectColumnOrRow effects={buffs} title="Buffs" />}
                                    {debuffs.length > 0 && <EffectColumnOrRow effects={debuffs} title="Debuffs" />}
                                </Box>
                            )}
                        </Box>
                        {showStats && !columnize && hasBuffsOrDebuffs && (
                            <Box sx={{ width: "100%", mt: 1 }}>
                                <Typography level="title-sm" sx={{ marginTop: 1.5 }}>
                                    Abilities
                                </Typography>
                                <AbilityStack
                                    abilities={abilities}
                                    teamType={unitProperties.team}
                                    isWidescreen={columnize}
                                    hasBreakApplied={hasBreakApplied}
                                />
                            </Box>
                        )}
                        {hasBuffsOrDebuffs && columnize && (
                            <Box
                                sx={{
                                    width: "100%",
                                    display: buffsVisible ? "flex" : "none",
                                    flexDirection: "column",
                                    opacity: buffsVisible ? 1 : 0,
                                    transition: buffsVisible ? "opacity 150ms ease-out" : "none",
                                }}
                            >
                                <EffectColumnOrRow effects={buffs} title="Buffs" isHorizontalLayout={true} />
                                <EffectColumnOrRow effects={debuffs} title="Debuffs" isHorizontalLayout={true} />
                            </Box>
                        )}
                    </List>
                </Toggler>
            </ListItem>
        );
    }
    return <ListItem nested />;
};

const arePropsEqual = (prev: UnitStatsListItemProps, next: UnitStatsListItemProps) => {
    if (prev.barSize !== next.barSize || prev.columnize !== next.columnize || prev.factionType !== next.factionType)
        return false;
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
