/**
 * Where the marketing site lives, relative to wherever this client is being served from.
 *
 * The client links out to site pages (rules, patches, player profiles). Those links used to be
 * hard-coded to `https://heroesofcrypto.io`, which is only correct in production: on the staging rig
 * it walked a tester straight off the box they were testing and onto the live site, so "the rules
 * link opens the wrong knowledge base" was really "the rules link opens production".
 *
 * Production is the one deployment that splits the two across hosts — the client owns
 * `app.heroesofcrypto.io` while the site owns the apex. Every other rig (staging, a LAN box, a
 * tunnel) serves both from ONE origin, so an empty origin — i.e. a relative URL — is what keeps a
 * link on the host it was clicked from. That is why the mapping is keyed on the known client host
 * rather than on "is this production": a `*.heroesofcrypto.io` test host is production-shaped but
 * still same-origin.
 */

/** The dedicated production client host. Its site counterpart is the apex. */
const PROD_CLIENT_HOST = "app.heroesofcrypto.io";
const PROD_SITE_ORIGIN = "https://heroesofcrypto.io";

/**
 * Origin to prefix site links with. Empty string means "same origin as this page", which is a valid
 * URL prefix (`"" + "/rules"` === `"/rules"`) and the correct answer for single-host rigs.
 *
 * `VITE_SITE_ORIGIN` overrides for setups the host rule cannot infer — notably local development,
 * where the client and the Astro site run on different ports. The literal `same-origin` forces the
 * relative form, mirroring the `VITE_HOST_*_API` convention in ./axios.
 */
export const siteOrigin = (): string => {
    const configured = import.meta.env.VITE_SITE_ORIGIN?.trim() ?? "";
    if (configured === "same-origin") {
        return "";
    }
    if (configured) {
        return configured.replace(/\/+$/, "");
    }
    if (typeof window === "undefined") {
        return PROD_SITE_ORIGIN;
    }
    return window.location.hostname === PROD_CLIENT_HOST ? PROD_SITE_ORIGIN : "";
};

/** Absolute-or-relative URL for a site path. Pass a rooted path, e.g. `siteUrl("/rules")`. */
export const siteUrl = (path: string): string => `${siteOrigin()}${path}`;

/**
 * Base for `new URL(path, base)`, which rejects an empty base. Falls back to the current page's
 * origin so callers building query strings keep working on same-origin rigs.
 */
export const siteUrlBase = (): string =>
    siteOrigin() || (typeof window !== "undefined" ? window.location.origin : PROD_SITE_ORIGIN);
