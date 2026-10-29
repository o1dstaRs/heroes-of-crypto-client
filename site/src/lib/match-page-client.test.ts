import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test("the shipped match page renders damage portraits from a public API response", async () => {
    const components = resolve(import.meta.dir, "../components");
    const source = readFileSync(resolve(components, "MatchPage.astro"), "utf8");
    const script = source.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
    expect(script).toBeDefined();
    const temporaryRoot = resolve(import.meta.dir, "../../tmp");
    mkdirSync(temporaryRoot, { recursive: true });
    const temporary = mkdtempSync(resolve(temporaryRoot, "match-page-client-"));
    try {
        const entry = resolve(temporary, "entry.ts");
        writeFileSync(
            entry,
            script!.replace(/from "(\.[^"]+)"/g, (_match, id) => `from ${JSON.stringify(resolve(components, id))}`),
        );
        const bundle = await Bun.build({
            entrypoints: [entry],
            target: "browser",
            format: "iife",
            define: {
                "import.meta.env": JSON.stringify({ PROD: true, VITE_HOST_MATCHMAKING_API: "https://api.test" }),
            },
        });
        expect(bundle.success).toBe(true);
        const nodes = new Map<
            string,
            {
                hidden: boolean;
                innerHTML: string;
                textContent: string;
                href: string;
                setAttribute: (name: string) => void;
                addEventListener: () => void;
            }
        >();
        for (const name of ["copy", "loading", "error", "error-message", "content", "retry", "back"]) {
            const node = {
                hidden: name !== "loading",
                innerHTML: "",
                textContent:
                    name === "copy"
                        ? JSON.stringify({ maps: ["Unknown", "Normal"], errorBody: "Report unavailable" })
                        : "",
                href: "",
                setAttribute(name: string) {
                    if (name === "hidden") this.hidden = true;
                },
                addEventListener() {},
            };
            nodes.set(`[data-match-${name}]`, node);
        }
        const gameId = "11111111-1111-4111-8111-111111111111";
        const payload = {
            gameId,
            outcome: "win",
            players: [
                { playerId: "22222222-2222-4222-8222-222222222222", username: "Alice", side: "lower", result: "win" },
                { playerId: "33333333-3333-4333-8333-333333333333", username: "Bob", side: "upper", result: "loss" },
            ],
            stats: {
                totalLaps: 1,
                gridType: 1,
                lowerDamage: 12,
                upperDamage: 4,
                lowerPerformers: [{ creatureId: 31, damageDealt: 12 }],
                upperPerformers: [],
            },
        };
        let requested = "";
        const run = new Function("document", "window", "fetch", await bundle.outputs[0].text());
        run(
            { querySelector: (selector: string) => nodes.get(selector), documentElement: { lang: "en" } },
            { location: { href: `https://site.test/match/?gameId=${gameId}` } },
            async (url: string) => {
                requested = url;
                return Response.json(payload);
            },
        );
        for (let attempt = 0; attempt < 50 && nodes.get("[data-match-loading]")!.hidden === false; attempt++) {
            await new Promise((done) => setTimeout(done, 1));
        }
        expect(requested).toBe(`https://api.test/v1/ranked-match/${gameId}`);
        expect(nodes.get("[data-match-error]")!.hidden).toBe(true);
        const content = nodes.get("[data-match-content]")!;
        expect(content.hidden).toBe(false);
        expect(content.innerHTML).toContain("damage-row");
        expect(content.innerHTML).toContain("portrait__art");
        expect(content.innerHTML).toContain("Alice");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});
