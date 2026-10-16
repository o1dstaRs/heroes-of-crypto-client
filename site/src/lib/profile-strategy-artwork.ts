import { portraitMarkup } from "./portrait";

export type StrategyArtwork = { alt: string } & ({ slug: string } | { src: string });

const escapeAttribute = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const strategyArtworkMarkup = (artwork: StrategyArtwork): string =>
    "slug" in artwork
        ? portraitMarkup(artwork.slug, artwork.alt, { className: "strategy-icon" })
        : `<img class="strategy-icon" src="${escapeAttribute(artwork.src)}" alt="${escapeAttribute(artwork.alt)}" loading="lazy" decoding="async">`;
