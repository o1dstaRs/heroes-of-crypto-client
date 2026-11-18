import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import featureRelease from "../../feature-assets.json";
import heroRelease from "../../hero-assets.json";
import release from "../../homepage-assets.json";
import cellarRelease from "../../tavern-cellar-assets.json";
import tavernRelease from "../../tavern-assets.json";
import { HOME_HERO_IMAGE } from "./hero-media";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("approved website artwork is bundled byte-for-byte across every release manifest", () => {
    const assets: { path: string; sha256: string; bytes?: number }[] = [
        ...release.assets,
        ...heroRelease.assets.map((asset) => ({ ...asset, path: `/${asset.path}` })),
        ...tavernRelease.assets.map((asset) => ({ ...asset, path: `/${asset.path}` })),
        ...[...featureRelease.files, ...cellarRelease.files].map((asset) => ({
            ...asset,
            path: asset.destination.replace(/^site\/public/, ""),
        })),
    ];
    for (const asset of assets) {
        const bytes = readFileSync(new URL(`../../public${asset.path}`, import.meta.url));
        if (asset.bytes !== undefined) expect(bytes.byteLength, asset.path).toBe(asset.bytes);
        expect(createHash("sha256").update(bytes).digest("hex"), asset.path).toBe(asset.sha256);
        expect(bytes.toString("ascii", 0, 4), asset.path).toBe("RIFF");
        expect(bytes.toString("ascii", 8, 12), asset.path).toBe("WEBP");
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
