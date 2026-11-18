import { getImage } from "astro:assets";
import hero from "../../public/assets/images/home/hero/taverns/39-forge-frost-no-flags-20261107.webp";
import { HOME_HERO_IMAGE } from "./hero-media";

// The image covers the full hero height on smaller viewports. Its download width
// must account for that crop, rather than choosing a blurry 390px-wide landscape.
export const HERO_IMAGE_SIZES =
    "(min-width: 1081px) 100vw, (min-width: 721px) max(1080px, calc((100svh - 68px) * 2)), max(1080px, calc((100svh - 102px) * 2))";
export const NARROW_HERO_IMAGE_SIZES = "max(540px, calc(100svh - 102px))";
export const NARROW_HERO_MEDIA = "(max-width: 400px)";
export const WIDE_HERO_MEDIA = "(min-width: 400.01px)";

let images: Promise<{ wide: string; narrow: string }> | undefined;

export function homeHeroImages() {
    return (images ??= (async () => {
        const wide = await Promise.all(
            [960, 1440, 1920, 2560, 3200, 3840].map(async (width) => {
                const image = await getImage({ src: hero, width, format: "webp", quality: 94 });
                return `${image.src} ${width}w`;
            }),
        );
        // A square retains the complete visible area of the original 58% mobile
        // crop, even at 400x540. TavernBackdrop compensates for the removed edges.
        const narrow = await Promise.all(
            [800, 1200, 1600, 2000, 2400].map(async (width) => {
                const image = await getImage({
                    src: hero,
                    width,
                    height: width,
                    fit: "cover",
                    position: "centre",
                    format: "webp",
                    quality: 94,
                });
                return `${image.src} ${width}w`;
            }),
        );
        return { wide: [...wide, `${HOME_HERO_IMAGE} ${hero.width}w`].join(", "), narrow: narrow.join(", ") };
    })());
}
