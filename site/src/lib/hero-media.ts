export const HOME_HERO_IMAGE = "/assets/images/home/hero/taverns/39-forge-frost-no-flags-20261107.webp";
/** Link previews (Open Graph, X, structured data): a 1200x630 crop of the home hero, current logo included.
 * Give a replacement a new file name; chat apps and X cache a preview by its URL. */
export const SOCIAL_PREVIEW_IMAGE = "/assets/images/social_preview_20261123.jpg";
/** Page headers, the login page and the play screen sit behind text, so they use tavern art without the logo
 * (the `.subhero` and `.auth-section` rules in global.css name the same file). */
export const PAGE_BACKDROP_IMAGE = "/assets/images/home/features/tavern_lower_floor_20261024.webp";

/**
 * A low fetch priority is only a hint: decorative downloads can still share bandwidth with the hero.
 * Wait for the visible artwork to decode and get a paint before starting those requests.
 */
export function afterHeroPaint(hero: ParentNode | null, ready: () => void): () => void {
    let disposed = false;
    let frame = 0;
    const images = Array.from(hero?.querySelectorAll<HTMLImageElement>("img") ?? []);

    void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => {
        if (disposed) return;
        frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                if (!disposed) ready();
            });
        });
    });

    return () => {
        disposed = true;
        cancelAnimationFrame(frame);
    };
}
