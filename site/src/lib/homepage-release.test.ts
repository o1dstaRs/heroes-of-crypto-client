import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import release from "../../homepage-assets.json";
import { HOME_HERO_IMAGE } from "./hero-media";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("approved homepage artwork is bundled byte-for-byte in a clean checkout", () => {
    for (const asset of release.assets) {
        const bytes = readFileSync(new URL(`../../public${asset.path}`, import.meta.url));
        expect(bytes.byteLength, asset.path).toBe(asset.bytes);
        expect(createHash("sha256").update(bytes).digest("hex"), asset.path).toBe(asset.sha256);
    }
    expect(release.assets.some((asset) => asset.path === HOME_HERO_IMAGE)).toBe(true);
});

test("first-visit markup ships the selected hero and button without browser preferences", () => {
    const home = source("../components/HomePage.astro");
    const tavern = source("../components/TavernBackdrop.astro");
    expect(tavern).toContain("src={HOME_HERO_IMAGE}");
    expect(tavern).toContain('data-logo-baked="true"');
    expect(home).toContain("--tavern-board-y: 2.5");
    expect(home).toContain('data-button-style="smoked-frame"');
    expect(home + tavern).not.toMatch(/localStorage|HeroButtonPicker|tavern-picker/);
    expect(home).toContain('import "../styles/home-continuation.css"');
    const sections = [
        home.indexOf('id="features"'),
        home.indexOf("<GameModes"),
        home.indexOf("<RankedArena"),
        home.indexOf('id="cta-design"'),
        home.indexOf('id="game-pitch"'),
        home.indexOf("roadmap-section"),
    ];
    expect(sections.every((position) => position >= 0)).toBe(true);
    expect(sections).toEqual([...sections].sort((a, b) => a - b));
});
