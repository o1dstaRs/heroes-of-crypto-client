/*
 * The one place the site knows how a creature portrait is put together.
 *
 * The game composes a portrait rather than storing one — faction background, a coloured shade, then the
 * creature art under an individually approved crop, scale and offsets — so every surface that shows a
 * creature has to build the same three layers or it shows a different picture from the one players see.
 *
 * Surfaces reach this two ways. Astro components render <CreaturePortrait>, which calls straight through
 * to `portraitMarkup`; the pages that assemble rows as HTML strings (profile line-ups, the meta snapshot,
 * match damage rows) call `portraitMarkup` themselves. Both get the same markup from the same recipe, so
 * a surface cannot quietly fall behind the others.
 *
 * The recipe file is generated — see site/scripts/sync_portrait_art.ts.
 */
import recipes from "./generated/portrait-recipes.json";

export interface PortraitRecipe {
    art: string;
    background: string | null;
    backgroundOpacity: number;
    shadeAlpha: number;
    shadeColor: number;
    backgroundTone?: "chaos";
    artPalette?: "hydra";
    mirrored: boolean;
    blurBackdrop: boolean;
    fit: "cover" | "contain";
    scale: number;
    offsetX: number;
    offsetY: number;
}

const ART_DIR = "/assets/images/units/portraits";
const BACKGROUND_DIR = "/assets/images/units/portrait-backgrounds";
/** Where the six creatures the game has no portrait recipe for still keep a plain image. */
const PLAIN_DIR = "/assets/images/units/units";
export const UNKNOWN_CREATURE_PORTRAIT = `${PLAIN_DIR}/unknown_creature_512.webp`;

const CREATURES = recipes.creatures as Record<string, PortraitRecipe | undefined>;

export const portraitRecipe = (slug: string): PortraitRecipe | undefined => CREATURES[slug];

export const portraitArtUrl = (slug: string): string => {
    const recipe = CREATURES[slug];
    return recipe ? `${ART_DIR}/${recipe.art}` : `${PLAIN_DIR}/${slug}_512.webp`;
};

const escapeAttribute = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HYDRA_FILTER_ID = "site-hydra-portrait-palette";
const alphaMatrix = (row: readonly number[]): string => [...Array(15).fill(0), ...row].join(" ");

/** Once per page in BaseLayout; dynamically inserted portraits use the same selective scale grading. */
export const portraitFilterMarkup = (): string => {
    const { hydraScale, hydraWarmMask, hydraNonEmissiveMask } = recipes.filters;
    return (
        `<svg width="0" height="0" aria-hidden="true" style="position:absolute;pointer-events:none"><defs>` +
        `<filter id="${HYDRA_FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
        `<feColorMatrix in="SourceGraphic" type="matrix" values="${hydraScale.join(" ")}" result="olive"/>` +
        `<feColorMatrix in="SourceGraphic" type="matrix" values="${alphaMatrix([...hydraWarmMask, 0, 0])}" result="warm"/>` +
        `<feColorMatrix in="warm" type="matrix" values="${alphaMatrix([0, 0, 0, -1, 1])}" result="cool"/>` +
        `<feColorMatrix in="SourceGraphic" type="matrix" values="${alphaMatrix(hydraNonEmissiveMask)}" result="nonEmissive"/>` +
        `<feComposite in="cool" in2="nonEmissive" operator="in" result="scales"/>` +
        `<feComposite in="olive" in2="scales" operator="in" result="gradedScales"/>` +
        `<feComposite in="SourceGraphic" in2="scales" operator="out" result="retainedArt"/>` +
        `<feComposite in="retainedArt" in2="gradedScales" operator="arithmetic" k2="1" k3="1"/>` +
        `</filter></defs></svg>`
    );
};

export interface PortraitMarkupOptions {
    /** Extra classes on the portrait root, so a surface can size and shape it from its own stylesheet. */
    className?: string;
    /** Hover text, for the small line-up tiles where the creature's name is not written beside it. */
    title?: string;
    /** Above-the-fold portraits skip lazy loading so the first screen is not assembled after paint. */
    eager?: boolean;
}

/**
 * One composed portrait as HTML. Layer order and z-indexes live in global.css (.portrait*); only the
 * per-creature numbers are inline, because they differ for every creature.
 */
export const portraitMarkup = (slug: string, name: string, options: PortraitMarkupOptions = {}): string => {
    if (typeof slug !== "string" || !slug) {
        // Without this the failure surfaces as "Cannot read properties of undefined (reading 'replace')"
        // from deep inside the escaper, naming neither the surface nor the creature.
        throw new Error(
            `portraitMarkup needs a creature slug; got ${JSON.stringify(slug)} for name ${JSON.stringify(name)}`,
        );
    }
    const { className, title, eager = false } = options;
    const loading = eager ? "eager" : "lazy";
    const rootClass = escapeAttribute(className ? `portrait ${className}` : "portrait");
    const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
    const alt = escapeAttribute(name);
    const recipe = CREATURES[slug];

    if (!recipe) {
        return (
            `<span class="${rootClass}"${titleAttribute}>` +
            `<img class="portrait__art portrait__art--plain" src="${PLAIN_DIR}/${escapeAttribute(slug)}_512.webp"` +
            ` alt="${alt}" loading="${loading}" decoding="async"` +
            ` onerror="this.onerror=null;this.src='${UNKNOWN_CREATURE_PORTRAIT}'"></span>`
        );
    }

    const backgroundStyle =
        `opacity:${recipe.backgroundOpacity}` +
        (recipe.backgroundTone === "chaos" ? `;filter:${recipes.filters.chaosBackground}` : "");
    const shadeColor = `#${recipe.shadeColor.toString(16).padStart(6, "0")}`;
    const background = recipe.background
        ? `<img class="portrait__bg" src="${BACKGROUND_DIR}/${recipe.background}" alt="" aria-hidden="true"` +
          ` loading="${loading}" decoding="async"` +
          ` style="${backgroundStyle}"` +
          `>` +
          `<span class="portrait__shade" style="opacity:${recipe.shadeAlpha};background:${shadeColor}"></span>`
        : "";
    const blurBackdrop = recipe.blurBackdrop
        ? `<img class="portrait__blur" src="${ART_DIR}/${recipe.art}" alt="" aria-hidden="true"` +
          ` loading="${loading}" decoding="async">`
        : "";
    // Mirror the crop offset WITH the creature, leaving the faction plate and soft backdrop intact.
    const mirrorSign = recipe.mirrored ? -1 : 1;
    const art =
        `<img class="portrait__art" src="${ART_DIR}/${recipe.art}" alt="${alt}"` +
        ` loading="${loading}" decoding="async"` +
        ` style="object-fit:${recipe.fit};transform:translate(${recipe.offsetX * mirrorSign}%, ${recipe.offsetY}%)` +
        ` scale(${recipe.scale}) scaleX(${mirrorSign})">`;
    const gradedArt =
        recipe.artPalette === "hydra"
            ? `<span class="portrait__palette" style="filter:url(#${HYDRA_FILTER_ID})">${art}</span>`
            : art;

    return `<span class="${rootClass}"${titleAttribute}>${background}${blurBackdrop}${gradedArt}</span>`;
};
