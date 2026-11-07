export const HOME_HERO_IMAGE = "/assets/images/home/hero/taverns/39-forge-frost-no-flags-20261107.webp";

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
