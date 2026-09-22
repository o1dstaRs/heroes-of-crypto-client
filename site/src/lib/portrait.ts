/*
 * The one place the site knows how a creature portrait is put together.
 *
 * The game composes a portrait rather than storing one — faction background, a black shade, then the
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

/** The game's approved pick-card proportions, 190x256, as a width/height ratio. */
export const PORTRAIT_ASPECT_RATIO = recipes.aspectRatio;

export const portraitRecipe = (slug: string): PortraitRecipe | undefined => CREATURES[slug];

export const portraitArtUrl = (slug: string): string => {
    const recipe = CREATURES[slug];
    return recipe ? `${ART_DIR}/${recipe.art}` : `${PLAIN_DIR}/${slug}_512.webp`;
};

const escapeAttribute = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

    const background = recipe.background
        ? `<img class="portrait__bg" src="${BACKGROUND_DIR}/${recipe.background}" alt="" aria-hidden="true"` +
          ` loading="${loading}" decoding="async"` +
          (recipe.backgroundOpacity === 1 ? "" : ` style="opacity:${recipe.backgroundOpacity}"`) +
          `>` +
          `<span class="portrait__shade" style="opacity:${recipe.shadeAlpha}"></span>`
        : "";
    const blurBackdrop = recipe.blurBackdrop
        ? `<img class="portrait__blur" src="${ART_DIR}/${recipe.art}" alt="" aria-hidden="true"` +
          ` loading="${loading}" decoding="async">`
        : "";
    const art =
        `<img class="portrait__art" src="${ART_DIR}/${recipe.art}" alt="${alt}"` +
        ` loading="${loading}" decoding="async"` +
        ` style="object-fit:${recipe.fit};transform:translate(${recipe.offsetX}%, ${recipe.offsetY}%)` +
        ` scale(${recipe.scale})">`;

    return `<span class="${rootClass}"${titleAttribute}>${background}${blurBackdrop}${art}</span>`;
};
