import { describe, expect, it } from "bun:test";

import { premiumSearchBody, premiumSearchGameId, readPremiumSearch } from "./premium_search";

const gameId = "7489ed1b-9a7c-4c0f-b07a-4a66ace95183";
const frame = (event: string, data: unknown) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
const stream = (text: string) =>
    new Response(
        new ReadableStream({
            start(controller) {
                for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte]));
                controller.close();
            },
        }),
    );

describe("Premium search requests", () => {
    it("binds move questions to an inspected stack in a live match and drops them elsewhere", () => {
        expect(
            premiumSearchBody("Explain this move", `/game/${gameId}`, [], "actor", "0123456789abcdef"),
        ).toMatchObject({ inspectedUnitId: "actor", inspectedOptionId: "0123456789abcdef" });
        expect(
            premiumSearchBody("Explain this move", `/game/${gameId}`, [], undefined, "0123456789abcdef"),
        ).not.toHaveProperty("inspectedOptionId");
        expect(
            premiumSearchBody("Explain this move", `/game/${gameId}/replay`, [], "actor", "0123456789abcdef"),
        ).not.toHaveProperty("inspectedOptionId");
    });

    it("sends only the inspected stack ID and drops it outside a live match", () => {
        expect(premiumSearchBody("Explain this stack", `/game/${gameId}`, [], "split-squire-2")).toMatchObject({
            gameId,
            inspectedUnitId: "split-squire-2",
        });
        expect(
            premiumSearchBody("Explain this stack", `/game/${gameId}/replay`, [], "split-squire-2"),
        ).not.toHaveProperty("inspectedUnitId");
        expect(premiumSearchBody("Explain this stack", "/play", [], "split-squire-2")).not.toHaveProperty(
            "inspectedUnitId",
        );
    });
    it("requests Premium explicitly with only the current live match ID", () => {
        expect(premiumSearchBody(" Why this pick? ", `/game/${gameId}`, [])).toEqual({
            mode: "premium",
            question: "Why this pick?",
            gameId,
            lang: "en",
            history: [],
        });
    });

    it.each([`/game/${gameId}/replay`, "/game/preview-match", "/sandbox/local", "/play", "/game/../account"])(
        "does not request live state on %s",
        (path) => expect(premiumSearchGameId(path)).toBeUndefined(),
    );

    it("bounds follow-ups below the server body limit", () => {
        const body = premiumSearchBody(
            "a".repeat(600),
            `/game/${gameId}`,
            Array.from({ length: 12 }, (_, index) => ({
                role: "assistant" as const,
                content: `${index}:` + "a".repeat(4000),
            })),
        );
        expect(body.history).toHaveLength(6);
        expect(body.history[0].content).toStartWith("6:");
        expect(JSON.stringify(body).length).toBeLessThan(16 * 1024);
    });

    it("also bounds UTF-8 and escaped history, dropping whole older exchanges", () => {
        const body = premiumSearchBody(
            "Как защитить армию?",
            `/game/${gameId}`,
            Array.from({ length: 6 }, (_, index) => ({
                role: index % 2 ? ("assistant" as const) : ("user" as const),
                content: "\u0001◆🛡️".repeat(1000),
            })),
        );
        expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThan(16 * 1024);
        expect(body.history.length % 2).toBe(0);
    });
});

describe("Premium answer stream", () => {
    it.each([undefined, "2222222222222222"])(
        "rejects an unconfirmed move before displaying any answer: %s",
        async (confirmed) => {
            const displayed: string[] = [];
            await expect(
                readPremiumSearch(
                    stream(
                        frame("meta", {
                            mode: "premium",
                            context: "match",
                            inspectedUnitId: "actor",
                            inspectedOptionId: confirmed,
                        }) + frame("delta", { text: "Unbound move" }),
                    ),
                    (kind) => displayed.push(kind),
                    "actor",
                    "1111111111111111",
                ),
            ).rejects.toThrow("suggested move could not be confirmed");
            expect(displayed).toEqual([]);
        },
    );

    it("accepts only the confirmed move and explains an expired offer", async () => {
        expect(
            await readPremiumSearch(
                stream(
                    frame("meta", {
                        mode: "premium",
                        context: "match",
                        inspectedUnitId: "actor",
                        inspectedOptionId: "1111111111111111",
                    }) + frame("done", { answer: "This angle uses ammunition." }),
                ),
                () => {},
                "actor",
                "1111111111111111",
            ),
        ).toBe("This angle uses ammunition.");
        await expect(
            readPremiumSearch(Response.json({ code: "premium_option_unavailable" }, { status: 409 }), () => {}),
        ).rejects.toThrow("move is no longer offered");
    });

    it.each([undefined, "different-squire"])(
        "does not display a stack answer without its matching confirmation: %s",
        async (confirmed) => {
            const displayed: string[] = [];
            await expect(
                readPremiumSearch(
                    stream(
                        frame("meta", { mode: "premium", context: "match", inspectedUnitId: confirmed }) +
                            frame("delta", { text: "Unbound answer" }),
                    ),
                    (kind) => displayed.push(kind),
                    "selected-squire",
                ),
            ).rejects.toThrow("could not be confirmed");
            expect(displayed).toEqual([]);
        },
    );

    it("accepts a stack answer confirmed by the authorized server", async () => {
        expect(
            await readPremiumSearch(
                stream(
                    frame("meta", { mode: "premium", context: "match", inspectedUnitId: "selected-squire" }) +
                        frame("done", { answer: "This selected Squire is affected by Break." }),
                ),
                () => {},
                "selected-squire",
            ),
        ).toBe("This selected Squire is affected by Break.");
    });

    it("reads fragmented UTF-8 and CRLF frames and keeps the completed answer", async () => {
        const kinds: string[] = [];
        const response = stream(
            frame("meta", { mode: "premium", context: "match", evidenceAvailable: false }) +
                frame("delta", { text: "◆ Protect your shooters." }) +
                frame("reset", {}) +
                frame("done", { answer: "Screen your shooters; spread against Hydra.", sources: [] }),
        );
        expect(await readPremiumSearch(response, (kind) => kinds.push(kind))).toBe(
            "Screen your shooters; spread against Hydra.",
        );
        expect(kinds).toEqual(["meta", "delta", "reset", "done"]);
    });

    it.each([{ language: "en" }, { mode: "knowledge" }])(
        "rejects a KB fallback before displaying it: %j",
        async (meta) => {
            const displayed: string[] = [];
            await expect(
                readPremiumSearch(stream(frame("meta", meta) + frame("delta", { text: "Hydra is a unit." })), (kind) =>
                    displayed.push(kind),
                ),
            ).rejects.toThrow("server update");
            expect(displayed).toEqual([]);
        },
    );

    it("does not accept a partial stream as a completed follow-up", async () => {
        await expect(
            readPremiumSearch(
                stream(frame("meta", { mode: "premium" }) + frame("delta", { text: "Partial" })),
                () => {},
            ),
        ).rejects.toThrow("interrupted");
    });

    it("surfaces failed match context separately", async () => {
        await expect(
            readPremiumSearch(Response.json({ code: "premium_context_unavailable" }, { status: 503 }), () => {}),
        ).rejects.toThrow("match could not be read");
    });

    it("asks for a fresh inspection when the selected stack is no longer visible", async () => {
        await expect(
            readPremiumSearch(Response.json({ code: "premium_focus_unavailable" }, { status: 409 }), () => {}),
        ).rejects.toThrow("Inspect a visible unit");
    });
});

it("finishes at the done event even if the server leaves its stream open", async () => {
    let cancelled = false;
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(
                new TextEncoder().encode(
                    frame("meta", { mode: "premium" }) + frame("done", { answer: "Keep your screen in place." }),
                ),
            );
        },
        cancel() {
            cancelled = true;
        },
    });
    expect(await readPremiumSearch(new Response(body), () => {})).toBe("Keep your screen in place.");
    expect(cancelled).toBe(true);
});

it.each(["null", "[]", "{broken"])("handles malformed response frames (%s) without crashing the UI", async (data) => {
    await expect(
        readPremiumSearch(stream(frame("meta", { mode: "premium" }) + `event: delta\ndata: ${data}\n\n`), () => {}),
    ).rejects.toThrow("could not be read");
});

it("rejects empty final answers and oversized unframed responses", async () => {
    await expect(
        readPremiumSearch(stream(frame("meta", { mode: "premium" }) + frame("done", { answer: " " })), () => {}),
    ).rejects.toThrow("interrupted");
    await expect(readPremiumSearch(new Response("x".repeat(512_001)), () => {})).rejects.toThrow("too large");
});

const outcome = {
    evidenceId: "pilot:angel",
    label: "Angel · ranked-draft/train",
    independentFamilies: 12,
    scoreRate: 0.5,
    interval95: [0.2, 0.8],
    status: "limited",
    caveat: "Observational, not a win prediction.",
};

it.each([
    ["sources", { items: {} }],
    ["sources", { items: [null] }],
    ["done", { answer: "Plan", sources: [{ id: "unit:angel", name: "Angel", href: {} }] }],
    ["premium_evidence", { packet: { ...outcome, label: {} } }],
    ["premium_evidence", { packet: { ...outcome, interval95: null } }],
    ["premium_evidence", { packet: { ...outcome, interval95: [0.8, 0.2] } }],
    ["premium_evidence", { packet: { ...outcome, scoreRate: 25 } }],
    ["premium_evidence", { packet: { ...outcome, metrics: { damage: null } } }],
    [
        "premium_evidence",
        {
            packet: {
                ...outcome,
                evidenceKind: "observed-combat-metrics",
                metrics: { damage: { description: "Damage", mean: "5", minFamilyMean: 0, maxFamilyMean: 10 } },
            },
        },
    ],
    ["meta", { mode: "premium", stage: ["fight"] }],
    ["error", { message: {} }],
] as const)("rejects malformed %s data before it can reach React (%j)", async (kind, data) => {
    const displayed: string[] = [];
    await expect(
        readPremiumSearch(stream(frame("meta", { mode: "premium" }) + frame(kind, data)), (event) =>
            displayed.push(event),
        ),
    ).rejects.toThrow("could not be read");
    expect(displayed).toEqual(["meta"]);
});

it("accepts outcome and metric evidence including missing measurements", async () => {
    const packets: unknown[] = [];
    const metric = {
        evidenceId: "pilot:healing",
        independentFamilies: 12,
        status: "limited",
        caveat: "Observed averages.",
        evidenceKind: "observed-health-metrics",
        metrics: {
            healing: { description: "Healing", mean: null, minFamilyMean: null, maxFamilyMean: null },
        },
    };
    await readPremiumSearch(
        stream(
            frame("meta", { mode: "premium" }) +
                frame("premium_evidence", { packet: outcome }) +
                frame("premium_evidence", { packet: metric }) +
                frame("done", { answer: "Choose based on mechanics; these samples are limited." }),
        ),
        (kind, event) => {
            if (kind === "premium_evidence") packets.push(event.packet);
        },
    );
    expect(packets).toEqual([outcome, metric]);
});

it("refuses a downgrade after the Premium handshake", async () => {
    await expect(
        readPremiumSearch(
            stream(
                frame("meta", { mode: "premium" }) +
                    frame("meta", { mode: "knowledge" }) +
                    frame("done", { answer: "A public answer." }),
            ),
            () => {},
        ),
    ).rejects.toThrow("server update");
});
