import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeRankedMatchExit, rankedExitLabel, rankedExitPreviewLabel } from "./ranked-exit";

const matchPageCopy = (lang: "en" | "ru") => {
    const source = readFileSync(resolve(import.meta.dir, "../components/MatchPage.astro"), "utf8");
    const expression = source.match(/const copy = ([\s\S]*?);\s*---/)?.[1];
    if (!expression) throw new Error("Match page copy is missing");
    return new Function("isRu", `return (${expression});`)(lang === "ru") as Record<string, unknown>;
};

test.each(["en", "ru"] as const)("the shipped match page renders portraits and exit labels (%s)", async (lang) => {
    const components = resolve(import.meta.dir, "../components");
    const source = readFileSync(resolve(components, "MatchPage.astro"), "utf8");
    const script = source.match(/<script>\s*([\s\S]*?)<\/script>/i)?.[1];
    expect(script).toBeDefined();
    // Bun.build tolerates duplicate bindings that the production Astro bundler rejects.
    expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(script!)).not.toThrow();
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
                textContent: name === "copy" ? JSON.stringify(matchPageCopy(lang)) : "",
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
            reason: "abandon",
            exit: { kind: "abandon", phase: "fight", scored: true, boardBp: 3100, enforced: true },
            players: [
                { playerId: "22222222-2222-4222-8222-222222222222", username: "Alice", side: "left", result: "win" },
                { playerId: "33333333-3333-4333-8333-333333333333", username: "Bob", side: "right", result: "loss" },
            ],
            stats: {
                totalLaps: 1,
                gridType: 1,
                leftDamage: 12,
                rightDamage: 4,
                leftPerformers: [{ creatureId: 31, damageDealt: 12 }],
                rightPerformers: [],
            },
        };
        let requested = "";
        const run = new Function("document", "window", "fetch", await bundle.outputs[0].text());
        run(
            { querySelector: (selector: string) => nodes.get(selector), documentElement: { lang } },
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
        expect(content.innerHTML).toContain(lang === "ru" ? "Выход при потерях 31%" : "Abandoned at 31% casualties");
        expect(content.innerHTML).toContain(lang === "ru" ? "Как работает выход" : "How leaving works");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test.each(["en", "ru"] as const)("match page explains every early result in its shipped language (%s)", (lang) => {
    const copy = matchPageCopy(lang);
    const labels = (key: string) => (typeof copy[key] === "string" ? copy[key] : "");
    for (const key of ["abandon", "unscored", "void", "exitRules"]) expect(labels(key).length).toBeGreaterThan(0);
    const cases = [
        [{ kind: "concede", boardBp: 6500 }, ["Conceded at 65% casualties", "Сдача при потерях 65%"]],
        [{ kind: "abandon", phase: "placement" }, ["Abandoned before the fight", "Выход до начала боя"]],
        [{ kind: "void" }, ["Voided: server problem", "Аннулирован: проблема сервера"]],
        [
            { kind: "abandon", cause: "double", scored: false },
            ["Unscored: both players left", "Без результата: оба игрока вышли"],
        ],
        [
            { kind: "abandon", scored: false, unscoredReason: "leaver_calibrating" },
            ["Unscored: abandoned during calibration", "Без результата: выход во время калибровки"],
        ],
        [
            { kind: "abandon", cause: "absence" },
            ["Abandoned at 31% casualties (away time ran out)", "Выход при потерях 31% (закончилось время отсутствия)"],
        ],
        [
            { kind: "abandon", cause: "afk" },
            ["Abandoned at 31% casualties (missed turns)", "Выход при потерях 31% (пропущенные ходы)"],
        ],
    ] as const;
    for (const [fields, expected] of cases) {
        const exit = normalizeRankedMatchExit({
            phase: "fight",
            scored: true,
            boardBp: 3100,
            enforced: true,
            ...fields,
        });
        expect(rankedExitLabel(exit, labels)).toBe(expected[lang === "ru" ? 1 : 0]);
        const preview = rankedExitPreviewLabel({ ...exit!, enforced: false, kind: "abandon" }, labels);
        expect(preview).toContain(lang === "ru" ? "По новым правилам выхода:" : "Under the new leaving rules:");
    }
});
