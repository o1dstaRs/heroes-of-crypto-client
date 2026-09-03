import { animationAtlases, type AnimationAtlasMeta, type AnimationUnitName } from "../../generated/animation_atlases";
import { images, type ImageKey } from "../../generated/image_imports";

export type SidebarAtlasMeta = AnimationAtlasMeta;

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
    const stateLeft = state.toLowerCase();
    // This portrait is only a few hundred CSS pixels tall. The quarter export is already sharp at
    // Retina density and avoids decoding (and publishing) the multi-thousand-pixel authoring sheet.
    const key = `${base}_${stateLeft}_atlas_quarter` as ImageKey;
    return key in images ? key : null;
}

export function getDefaultAnimationConfig(
    unitName?: string | null,
): { meta: SidebarAtlasMeta; imageSrc: string } | null {
    // Sidebar art is a portrait, not a distant full-body board pose. All creatures from the approved
    // full-body refresh have a matching generated chest-to-head 512 image, so keep that crop here while
    // the battlefield uses their authored idle/action atlases.
    if (unitName && FULL_BODY_PORTRAIT_UNITS.has(unitName.trim())) return null;
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const unitStates = animationAtlases[normalized] as unknown as Record<string, SidebarAtlasMeta>;
    const stateNames = Object.keys(unitStates);
    if (!stateNames.length) return null;
    const preferredState = stateNames.includes("idle")
        ? "idle"
        : stateNames.includes("default")
          ? "default"
          : stateNames[0];
    const meta = unitStates[preferredState];
    const imageKey = atlasImageKeyFromUnitAndState(normalized, preferredState);
    if (!imageKey) return null;
    const imageSrc = images[imageKey];
    return imageSrc ? { meta, imageSrc } : null;
}

// Decode each atlas at most once so selection is responsive without accumulating duplicate image objects.
const decodedImageCache = new Map<string, Promise<void>>();
const readyAtlasSrcs = new Set<string>();

export function warmAtlas(src: string): Promise<void> {
    let existing = decodedImageCache.get(src);
    if (!existing) {
        existing = new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.src = src;
            img.decode().then(resolve, resolve);
        });
        decodedImageCache.set(src, existing);
        existing.then(() => readyAtlasSrcs.add(src));
    }
    return existing;
}

export function isAtlasReady(src: string): boolean {
    return readyAtlasSrcs.has(src);
}

/** Pre-decode a unit's sidebar animation atlas so selecting it later is instant. */
export function prefetchUnitAtlas(unitName?: string | null): void {
    const config = getDefaultAnimationConfig(unitName);
    if (config) void warmAtlas(config.imageSrc);
}
