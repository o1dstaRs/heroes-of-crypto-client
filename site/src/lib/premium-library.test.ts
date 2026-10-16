import { describe, expect, test } from "bun:test";
import {
    escapePremiumHtml,
    premiumApiUrl,
    premiumPlanLevels,
    rankPremiumRows,
    type PremiumRow,
    type PremiumLibraryResponse,
} from "./premium-library";
import { premiumCatalog } from "./premium-catalog";
import { renderPremiumDashboard, renderPremiumUnits, type PremiumView } from "./premium-render";

const row = (key: string, score: number, families: number, low: number): PremiumRow => ({
    key,
    ids: [Number(key)],
    score,
    families,
    observations: families,
    interval: [low, 1],
    frequency: 0.1,
});
const view: PremiumView = {
    lang: "en",
    minimum: 50,
    search: "",
    level: "",
    sort: "confidence",
    combo: "pairs",
    tier: 1,
};
describe("Premium library presentation", () => {
    test("does not promote a one-family 100% result over supported evidence", () => {
        const rows = [row("1", 1, 1, 0), row("2", 0.6, 100, 0.48), row("3", 0.65, 55, 0.4)];
        expect(rankPremiumRows(rows, 50).map((row) => row.key)).toEqual(["2", "3"]);
        expect(rankPremiumRows(rows, 50, "score").map((row) => row.key)).toEqual(["3", "2"]);
        expect(rows[0].key).toBe("1");
    });
    test("decodes all six augment axes without inventing historical Empower investment", () => {
        expect(premiumPlanLevels("P1-A0-M3-S0-V2")).toEqual([1, 0, 3, 0, 2, 0]);
        expect(premiumPlanLevels("P0-A1-M0-S1-V0-E3")).toEqual([0, 1, 0, 1, 0, 3]);
        expect(premiumPlanLevels("P9-A0-M0-S0-V0")).toBeNull();
    });
    test("uses the game service and correct dev/production prefixes", () => {
        expect(premiumApiUrl("account", { hostname: "heroesofcrypto.io", protocol: "https:", production: false })).toBe(
            "https://game.heroesofcrypto.io/v1/premium/account",
        );
        expect(premiumApiUrl("library", { hostname: "localhost", protocol: "http:", production: false })).toBe(
            "http://localhost:3001/v1/game/premium/library",
        );
        expect(
            premiumApiUrl("library", { hostname: "192.168.1.2", protocol: "http:", port: "3011", production: false }),
        ).toBe("http://192.168.1.2:3011/v1/game/premium/library");
        expect(
            premiumApiUrl("account", {
                hostname: "test.heroesofcrypto.io",
                protocol: "https:",
                api: "https://test.heroesofcrypto.io/",
                production: true,
            }),
        ).toBe("https://test.heroesofcrypto.io/v1/premium/account");
    });
    test("escapes labels and keeps zero support distinct from a losing result", () => {
        expect(escapePremiumHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
        expect(renderPremiumUnits([], premiumCatalog("en"), view)).toContain("No units match");
        expect(renderPremiumUnits([], premiumCatalog("en"), view)).not.toContain("0.0%");
    });
    test("uses the same portrait recipe and valid knowledge-base anchors", () => {
        const catalog = premiumCatalog("en");
        const entry = Object.entries(catalog.units).find(([, item]) => item.slug === "black_dragon")!;
        const html = renderPremiumUnits([row(entry[0], 0.6, 100, 0.48)], catalog, view);
        expect(html).toContain("#unit-black-dragon");
        expect(html).toContain("portrait");
        expect(html).toContain("Black Dragon");
        expect(
            renderPremiumUnits([row(entry[0], 0.6, 100, 0.48)], catalog, { ...view, search: "does-not-exist" }),
        ).toContain("No units match");
    });
    test("renders every section and provenance without pooling snapshots", () => {
        const snapshot = {
            snapshotId: "<script>alert(1)</script>",
            sourceSha256: "a".repeat(64),
            studyProfile: "premium-ranked-v3",
            fights: 21000,
            status: "development",
            caveats: ["Historical defect disclosed."],
        };
        const data: PremiumLibraryResponse = {
            entitlement: { active: true, reason: "account" },
            snapshot,
            snapshots: [snapshot],
            library: {
                scope: { cohort: "ranked-draft" },
                families: 0,
                armies: 0,
                maps: [],
                units: [],
                pairs: [],
                triples: [],
                artifactsTier1: [],
                artifactsTier2: [],
                synergies: [],
                plans: [],
                doctrines: [],
            },
        };
        const html = renderPremiumDashboard(data, premiumCatalog("en"), view);
        for (const id of ["overview", "units", "combos", "artifacts", "synergies", "builds", "playbook", "evidence"])
            expect(html).toContain(`id="premium-${id}"`);
        expect(html).toContain("Historical defect disclosed.");
        expect(html).toContain("21,000");
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("35,000");
    });
});
