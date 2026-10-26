import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

const component = resolve(import.meta.dir, "../components/MatchPage.astro");
const gameId = "11111111-1111-4111-8111-111111111111";
const playerIds = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const payload = {
    gameId,
    finishedTime: 1792886355414,
    durationMs: 1000617,
    outcome: "win",
    reason: "concede",
    winnerPlayerId: playerIds[1],
    players: playerIds.map((playerId, index) => ({
        playerId,
        username: index ? "Opponent" : "Viewer",
        side: index ? "upper" : "lower",
        result: index ? "win" : "loss",
        mmrBefore: 1000,
        mmrAfter: index ? 1010 : 990,
        delta: index ? 10 : -10,
        goldEarned: 0,
        calibration: false,
    })),
    stats: {
        totalLaps: 6,
        gridType: 4,
        lowerDamage: 4112,
        upperDamage: 3409,
        lowerPerformers: [{ creatureId: 5, damageDealt: 1147 }],
        upperPerformers: [{ creatureId: 55, damageDealt: 1008 }],
        setupRecorded: true,
        lowerSetup: { artifactTier1: 7, artifactTier2: 15, doctrine: 3, augmentArmor: 3, augmentSniper: 3 },
        upperSetup: { artifactTier1: 4, artifactTier2: 14, doctrine: 1, augmentEmpower: 3 },
        replayAvailable: true,
    },
};

class PageElement {
    hidden = false;
    innerHTML = "";
    textContent = "";
    href = "";
    listeners = new Map<string, () => void>();
    setAttribute(name: string): void {
        if (name === "hidden") this.hidden = true;
    }
    addEventListener(name: string, listener: () => void): void {
        this.listeners.set(name, listener);
    }
}

const bundlePage = async (): Promise<string> => {
    const source = await readFile(component, "utf8");
    const script = source.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error("Missing match page browser script");
    const contents = script
        .replace(
            /\bfrom\s+"([^"]+)"/g,
            (_match, specifier: string) => `from ${JSON.stringify(Bun.resolveSync(specifier, dirname(component)))}`,
        )
        .replace("void load();", "globalThis.reportLoaded = load();");
    const directory = await mkdtemp(join(tmpdir(), "hoc-match-page-runtime-"));
    try {
        const entry = join(directory, "match-page.ts");
        await writeFile(entry, contents);
        const result = await Bun.build({
            entrypoints: [entry],
            target: "browser",
            format: "iife",
            define: { "import.meta.env": JSON.stringify({ PROD: true, VITE_IS_PROD: "true" }) },
        });
        if (!result.success) throw new AggregateError(result.logs, "Match page script did not bundle");
        return result.outputs[0].text();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
};

const runPage = async (script: string, response: unknown, language: "en" | "ru" = "en") => {
    const elements = new Map(
        ["copy", "loading", "error", "error-message", "content", "retry", "back"].map((name) => [
            `[data-match-${name}]`,
            new PageElement(),
        ]),
    );
    elements.get("[data-match-copy]")!.textContent = JSON.stringify({
        maps: ["Unknown", "Standard", "Water", "Lava", "Mountains"],
        defeat: language === "ru" ? "Поражение" : "Defeat",
        victory: "Victory",
        errorBody: "Report unavailable",
        noStats: "No battle statistics recorded",
        armySetup: "Army setup",
    });
    elements.get("[data-match-error]")!.hidden = true;
    elements.get("[data-match-content]")!.hidden = true;
    const location = new URL(`https://heroesofcrypto.io/match/?gameId=${gameId}&playerId=${playerIds[0]}`);
    const requests: string[] = [];
    const context = {
        document: {
            documentElement: { lang: language },
            querySelector: (selector: string) => elements.get(selector) ?? null,
        },
        window: { location },
        location,
        URL,
        URLSearchParams,
        Response,
        fetch: (url: string) => {
            requests.push(String(url));
            return Promise.resolve(Response.json(response));
        },
        reportLoaded: undefined as Promise<void> | undefined,
    };
    runInNewContext(script, context);
    expect(typeof context.reportLoaded?.then).toBe("function");
    await context.reportLoaded;
    return { elements, requests };
};

const pageScript = await bundlePage();

test.each(["en", "ru"] as const)(
    "the actual %s browser script renders damage portraits and both setups",
    async (language) => {
        const { elements, requests } = await runPage(pageScript, payload, language);
        expect(requests).toEqual([`https://mm.heroesofcrypto.io/v1/ranked-match/${gameId}`]);
        expect(elements.get("[data-match-error]")!.hidden).toBe(true);
        expect(elements.get("[data-match-loading]")!.hidden).toBe(true);
        const content = elements.get("[data-match-content]")!;
        expect(content.hidden).toBe(false);
        expect(content.innerHTML).toContain(language === "ru" ? "Поражение" : "Defeat");
        expect(content.innerHTML).toContain("damage-portrait");
        expect(content.innerHTML).toContain(new Intl.NumberFormat(language).format(1147));
        expect(content.innerHTML).toContain(new Intl.NumberFormat(language).format(1008));
        expect(content.innerHTML.match(/class="setup-panel"/g)).toHaveLength(2);
        expect(content.innerHTML).toContain(`/game/${gameId}/replay`);
        expect(elements.get("[data-match-back]")!.href).toContain(`playerId=${playerIds[0]}`);
    },
);

test("legacy reports without damage metadata still render instead of showing a loading failure", async () => {
    const { elements } = await runPage(pageScript, { ...payload, stats: null });
    expect(elements.get("[data-match-error]")!.hidden).toBe(true);
    expect(elements.get("[data-match-content]")!.hidden).toBe(false);
    expect(elements.get("[data-match-content]")!.innerHTML).toContain("No battle statistics recorded");
});
