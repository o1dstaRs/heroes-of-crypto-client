import { describe, expect, test } from "bun:test";

import { artifacts } from "./artifacts-data";
import { portraitMarkup } from "./portrait";
import { strategyArtworkMarkup } from "./profile-strategy-artwork";

describe("public profile strategy artwork", () => {
    test("keeps the canonical composed portrait for creature strategies", () => {
        expect(strategyArtworkMarkup({ slug: "berserker", alt: "Berserker" })).toBe(
            portraitMarkup("berserker", "Berserker", { className: "strategy-icon" }),
        );
    });

    test("renders catalog artifacts and combat augments without requiring a creature slug", () => {
        for (const artwork of [
            { src: artifacts[0].icon, alt: artifacts[0].name },
            { src: "/assets/images/units/abilities/armor_augment_256.webp", alt: "Armor" },
        ]) {
            const markup = strategyArtworkMarkup(artwork);
            expect(markup).toContain(`src="${artwork.src}"`);
            expect(markup).toContain(`alt="${artwork.alt}"`);
            expect(markup).not.toContain("portrait__");
        }
    });

    test("escapes image attributes", () => {
        const markup = strategyArtworkMarkup({ src: '/icon.webp?a=1&b="2"', alt: '<Armor & "Might">' });
        expect(markup).toContain('src="/icon.webp?a=1&amp;b=&quot;2&quot;"');
        expect(markup).toContain('alt="&lt;Armor &amp; &quot;Might&quot;&gt;"');
    });
});
