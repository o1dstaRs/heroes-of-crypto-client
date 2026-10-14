import { describe, expect, test } from "bun:test";
import { premiumAiBody, readPremiumLibrarySearch, type PremiumAiSelection } from "./premium-ai";
import { renderPremiumAiEvidence } from "./premium-ai-panel";
import { renderMarkdown } from "./markdown-lite";

const selection: PremiumAiSelection = {
    snapshotId: "a".repeat(24),
    cohort: "ranged-heavy",
    map: 3,
    minimumFamilies: 50,
};
const frame = (kind: string, data: unknown) => "event: " + kind + "\r\ndata: " + JSON.stringify(data) + "\r\n\r\n";
const response = (events: [string, unknown][]) => {
    const bytes = new TextEncoder().encode(events.map(([kind, data]) => frame(kind, data)).join(""));
    return new Response(
        new ReadableStream({
            start(controller) {
                for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
                controller.close();
            },
        }),
    );
};
const meta = { mode: "premium", evidenceAvailable: true, library: selection };
describe("Premium website AI data boundary", () => {
    test("sends only selected scope and bounded follow-up history", () => {
        const body = premiumAiBody(
            "  Why this pair? ",
            "ru",
            selection,
            Array.from({ length: 20 }, (_, i) => ({
                role: i % 2 ? ("assistant" as const) : ("user" as const),
                content: "語".repeat(2000),
            })),
        );
        expect(body).toMatchObject({ mode: "premium", lang: "ru", question: "Why this pair?", library: selection });
        expect(body).not.toHaveProperty("gameId");
        expect(body.history.length).toBeLessThanOrEqual(6);
        expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(15000);
    });
    test("accepts chunked UTF-8 answers only after matching the selected dataset", async () => {
        const events: string[] = [];
        const answer = await readPremiumLibrarySearch(
            response([
                ["meta", meta],
                ["delta", { text: "Синергия ◆" }],
                ["done", { answer: "Синергия ◆", sources: [] }],
            ]),
            selection,
            (kind) => events.push(kind),
        );
        expect(answer).toBe("Синергия ◆");
        expect(events).toEqual(["meta", "delta", "done"]);
    });
    test.each([
        { mode: "premium", evidenceAvailable: true },
        { ...meta, evidenceAvailable: false },
        { ...meta, library: { ...selection, snapshotId: "b".repeat(24) } },
        { ...meta, library: { ...selection, cohort: "ranked-draft" } },
        { ...meta, library: { ...selection, map: undefined } },
        { ...meta, library: { ...selection, minimumFamilies: 20 } },
    ])("rejects missing or mismatched library handshake %#", async (bad) => {
        let emitted = false;
        await expect(
            readPremiumLibrarySearch(
                response([
                    ["meta", bad],
                    ["done", { answer: "Unverified." }],
                ]),
                selection,
                () => (emitted = true),
            ),
        ).rejects.toThrow("selected dataset");
        expect(emitted).toBe(false);
    });
    test("does not treat interrupted streams or public search as completed advice", async () => {
        await expect(
            readPremiumLibrarySearch(
                response([
                    ["meta", meta],
                    ["delta", { text: "Partial." }],
                ]),
                selection,
                () => {},
            ),
        ).rejects.toThrow("interrupted");
        await expect(
            readPremiumLibrarySearch(
                response([
                    ["meta", {}],
                    ["done", { answer: "Free answer." }],
                ]),
                selection,
                () => {},
            ),
        ).rejects.toThrow("server update");
    });
    test("escapes evidence and preserves unavailable versus zero scores", () => {
        const packet = {
            evidenceId: "<script>bad</script>",
            label: "<img src=x>",
            independentFamilies: 0,
            status: "none" as const,
            caveat: "A < B",
            scoreRate: null,
            interval95: [0, 1] as [number, number],
        };
        expect(renderPremiumAiEvidence(packet, "en")).toContain("No matching evidence");
        expect(renderPremiumAiEvidence(packet, "en")).not.toContain("<script>");
        expect(renderPremiumAiEvidence({ ...packet, scoreRate: 0 }, "en")).toContain("0.0%");
        expect(renderMarkdown("<script>alert(1)</script> [bad](javascript:alert)")).not.toContain('href="javascript:');
    });
});
