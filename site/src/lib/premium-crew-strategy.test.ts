import { expect, test } from "bun:test";
import { finalizeA19Placement } from "@heroesofcrypto/common/src/ai/placement/adapter";
import { premiumCatalog } from "./premium-catalog";
import { CREW_LEVELS, premiumCrewBoardPlan, randomPremiumEnemy, samplePremiumCrew } from "./premium-crew";
import { createCrewStrategy, premiumCrewStrategyRequest, type CrewStrategyState } from "./premium-crew-strategy";

const catalog = premiumCatalog("en");
const own = samplePremiumCrew(null, catalog);
const selection = { snapshotId: "a".repeat(24), cohort: "ranked-draft", minimumFamilies: 50 };
const request = (roll = 0) =>
    premiumCrewStrategyRequest(
        premiumCrewBoardPlan(
            own,
            randomPremiumEnemy(own, catalog, () => roll),
            catalog,
            "screen",
            1,
            finalizeA19Placement,
        ),
        catalog,
        "en",
        selection,
    )!;
const sse = (answer: string, library: unknown = selection) =>
    new Response(
        `event: meta\ndata: ${JSON.stringify({ mode: "premium", evidenceAvailable: true, library })}\n\nevent: delta\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: ${JSON.stringify({ answer, sources: [] })}\n\n`,
    );
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

test("automatic briefs carry both displayed formations, actual setup and pinned evidence, within API limits", () => {
    const longest: number[] = [];
    for (const level of CREW_LEVELS)
        longest.push(
            Number(
                Object.entries(catalog.units)
                    .filter(([id, item]) => item.level === level && item.kit?.amount && !longest.includes(Number(id)))
                    .sort((a, b) => b[1].name.length - a[1].name.length)[0][0],
            ),
        );
    const enemy = randomPremiumEnemy(longest, catalog, () => 0.9);
    const plan = premiumCrewBoardPlan(longest, enemy, catalog, "spread", 3, finalizeA19Placement);
    for (const lang of ["en", "ru"] as const) {
        const req = premiumCrewStrategyRequest(plan, catalog, lang, selection, "source-hash")!;
        expect(req.body.question.length).toBeLessThanOrEqual(600);
        expect(req.body.history.every((entry) => entry.role === "user" && entry.content.length <= 2000)).toBe(true);
        expect(new TextEncoder().encode(JSON.stringify(req.body)).length).toBeLessThan(15000);
        expect(req.body.library).toEqual(selection);
        for (const body of [...plan.own.input.bodies, ...plan.enemy.input.bodies])
            expect(req.body.question).toContain(body.name);
        const facts = req.body.history.map((entry) => entry.content).join("");
        expect(facts).toContain("hypothetical website");
        expect(facts).toContain("source-hash");
        expect(facts).toContain('"map":3');
        expect(facts).toContain('"cell":');
        expect(facts).toContain("Battle Trance");
        expect(facts).toContain("enemy artifacts/upgrades are unknown");
        expect(req.body).not.toHaveProperty("gameId");
    }
});

test("briefs cover a complete crew without inventing an enemy, and wait for partial crews or pending AI positions", () => {
    const noEnemy = premiumCrewBoardPlan(own, [], catalog, "screen", 1);
    expect(premiumCrewStrategyRequest(noEnemy, catalog, "en")!.body.question).toContain("not selected");
    expect(premiumCrewStrategyRequest(noEnemy, catalog, "en")!.body).not.toHaveProperty("library");
    expect(
        premiumCrewStrategyRequest(premiumCrewBoardPlan(own.slice(0, 5), [], catalog, "screen", 1), catalog, "en"),
    ).toBeUndefined();
    expect(
        premiumCrewStrategyRequest(
            premiumCrewBoardPlan(own, randomPremiumEnemy(own, catalog), catalog, "screen", 1),
            catalog,
            "en",
        ),
    ).toBeUndefined();
    expect(request(0).key).not.toBe(request(0.5).key);
});

test("a changed battlefield, source or sample threshold invalidates the brief's context", () => {
    const enemy = randomPremiumEnemy(own, catalog, () => 0);
    const normal = premiumCrewBoardPlan(own, enemy, catalog, "screen", 1, finalizeA19Placement);
    const lava = premiumCrewBoardPlan(own, enemy, catalog, "screen", 3, finalizeA19Placement);
    const base = premiumCrewStrategyRequest(normal, catalog, "en", selection, "source-one")!;
    expect(premiumCrewStrategyRequest(lava, catalog, "en", selection, "source-one")!.key).not.toBe(base.key);
    expect(premiumCrewStrategyRequest(normal, catalog, "en", selection, "source-two")!.key).not.toBe(base.key);
    expect(
        premiumCrewStrategyRequest(normal, catalog, "en", { ...selection, minimumFamilies: 20 }, "source-one")!.key,
    ).not.toBe(base.key);
});

test("settled boards generate automatically once, and reuse completed answers on unrelated rerenders", async () => {
    const ready = deferred<CrewStrategyState>();
    let calls = 0;
    const states: CrewStrategyState[] = [];
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => "test-token",
        fetch: async () => {
            calls++;
            return sse("Keep the back line protected.");
        },
        onChange(state) {
            states.push(state);
            if (state.phase === "ready") ready.resolve(state);
        },
    });
    const req = request();
    strategy.update(req);
    strategy.update(req);
    expect((await ready.promise).text).toContain("back line");
    strategy.update(req);
    expect(calls).toBe(1);
    expect(states.at(-1)?.phase).toBe("ready");
    strategy.suspend();
    strategy.update(req);
    expect(states.at(-1)?.phase).toBe("ready");
    expect(calls).toBe(1);
    strategy.suspend();
});

test("rapid picks debounce into the final board without sending intermediate lineups", async () => {
    const ready = deferred<void>();
    const bodies: string[] = [];
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => "test-token",
        fetch: async (body) => {
            bodies.push(JSON.stringify(body));
            return sse("Final board only.");
        },
        onChange(state) {
            if (state.phase === "ready") ready.resolve();
        },
    });
    strategy.update(request(0));
    strategy.update(request(0.2));
    const final = request(0.5);
    strategy.update(final);
    await ready.promise;
    expect(bodies).toEqual([JSON.stringify(final.body)]);
    strategy.suspend();
});

test("suspending for logout or changing filters cancels a queued automatic request", async () => {
    let calls = 0;
    let last: CrewStrategyState | undefined;
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => "token",
        fetch: async () => {
            calls++;
            return sse("Must not send.");
        },
        onChange: (state) => {
            last = state;
        },
    });
    strategy.update(request());
    strategy.suspend();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
    expect(last?.phase).toBe("idle");
});

test("late superseded responses are discarded and cannot overwrite or cache a different enemy's plan", async () => {
    const oldFetch = deferred<Response>(),
        started = deferred<void>(),
        ready = deferred<void>();
    const states: CrewStrategyState[] = [];
    let calls = 0;
    let oldSignal: AbortSignal | undefined;
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => "test-token",
        fetch: async (_body, _token, signal) => {
            calls++;
            if (calls === 1) {
                oldSignal = signal;
                started.resolve();
                return oldFetch.promise;
            }
            return sse("Current enemy plan.");
        },
        onChange(state) {
            states.push(state);
            if (state.phase === "ready") ready.resolve();
        },
    });
    strategy.update(request(0));
    await started.promise;
    strategy.update(request(0.5));
    expect(oldSignal?.aborted).toBe(true);
    expect(states.at(-1)?.text).toBe("");
    oldFetch.resolve(sse("Stale enemy plan."));
    await ready.promise;
    expect(states.at(-1)?.text).toBe("Current enemy plan.");
    expect(states.some((state) => state.text.includes("Stale"))).toBe(false);
    strategy.suspend();
});

test("mismatched datasets show an honest error, with no automatic retry loop; retry requests the same board", async () => {
    const failed = deferred<void>(),
        ready = deferred<void>();
    let calls = 0;
    const states: CrewStrategyState[] = [];
    const req = request();
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => "test-token",
        fetch: async () => {
            calls++;
            return calls === 1 ? sse("Wrong dataset.", { ...selection, map: 4 }) : sse("Verified plan.");
        },
        onChange(state) {
            states.push(state);
            if (state.phase === "error") failed.resolve();
            if (state.phase === "ready") ready.resolve();
        },
    });
    strategy.update(req);
    await failed.promise;
    strategy.update(req);
    expect(calls).toBe(1);
    expect(states.at(-1)?.text).toBe("");
    strategy.retry();
    await ready.promise;
    expect(calls).toBe(2);
    expect(states.at(-1)?.text).toBe("Verified plan.");
    strategy.suspend();
});

test("account rejection and suspension stop automatic advice; completed answers never cross accounts", async () => {
    const lost = deferred<void>();
    const denied = createCrewStrategy({
        delayMs: 0,
        getToken: () => "token",
        fetch: async () => new Response("{}", { status: 403 }),
        onChange() {},
        onAccessLost: () => lost.resolve(),
    });
    denied.update(request());
    await lost.promise;
    denied.suspend();
    let token: string | null = "account-one",
        calls = 0;
    let ready = deferred<void>();
    const states: CrewStrategyState[] = [];
    const strategy = createCrewStrategy({
        delayMs: 0,
        getToken: () => token,
        fetch: async () => {
            calls++;
            return sse("Account plan.");
        },
        onChange(state) {
            states.push(state);
            if (state.phase === "ready") ready.resolve();
        },
    });
    strategy.update(request());
    await ready.promise;
    token = null;
    strategy.update(request());
    expect(states.at(-1)?.phase).toBe("idle");
    expect(states.at(-1)?.text).toBe("");
    token = "account-two";
    ready = deferred<void>();
    strategy.update(request());
    await ready.promise;
    expect(calls).toBe(2);
    strategy.suspend();
});
