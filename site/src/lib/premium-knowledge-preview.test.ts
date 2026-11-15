import { expect, test } from "bun:test";
import { buildKnowledgeGraph } from "./knowledge/graph-builder";
import {
    findKnowledgePreview,
    knowledgeReference,
    renderKnowledgePreview,
    premiumPreviewPlacement,
} from "./premium-knowledge-preview";

test("recognizes English and Russian knowledge links without fetching external destinations", () => {
    expect(knowledgeReference("/knowledge-base/?entry=Luck%20Blessing#ability-luck-blessing")).toBe("Luck Blessing");
    expect(knowledgeReference("https://heroesofcrypto.io/ru/knowledge-base/#unit-griffin")).toBe("unit-griffin");
    for (const href of [
        "https://evil.test/knowledge-base/?entry=Griffin",
        "//evil.test/knowledge-base/",
        "/portal",
        "javascript:alert(1)",
    ])
        expect(knowledgeReference(href)).toBeUndefined();
});

test("previews exact current entries and localizes full mechanics rather than just the link label", () => {
    const entries = buildKnowledgeGraph().nodes;
    const blessing = findKnowledgePreview(entries, "ability-luck-blessing")!;
    const html = renderKnowledgePreview(blessing, "en");
    expect(html).toContain("+2/4/6/8/10");
    expect(html).toContain("strongest living source");
    expect(html).not.toContain("within 2 cells");
    expect(renderKnowledgePreview(blessing, "ru")).toContain("каждый союзник на поле");
    expect(findKnowledgePreview(entries, "Griffin")?.id).toBe("unit:griffin");
    expect(findKnowledgePreview(entries, "not-a-real-entry")).toBeUndefined();
});

test("preview titles and content cannot inject model or catalog HTML", () => {
    const html = renderKnowledgePreview(
        {
            id: "unit:test",
            type: "unit",
            name: '<img src=x onerror="alert(1)">',
            href: "/knowledge-base/#unit-test",
            text: "<script>alert(1)</script> [bad](javascript:alert)",
        },
        "en",
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
});

test("a tall hover uses the space beside its trigger instead of forcing a 480px scroll area", () => {
    const anchor = { left: 650, right: 710, top: 450, bottom: 510 };
    const result = premiumPreviewPlacement(anchor, { width: 1440, height: 1000 }, { width: 440, height: 760 });
    expect(result.maxHeight).toBe(976);
    expect(result.left).toBeGreaterThanOrEqual(anchor.right + 10);
    expect(result.top).toBeGreaterThanOrEqual(12);
    expect(result.top + 760).toBeLessThanOrEqual(988);
});

test("full-height content stays readable even when neither side nor above/below can hold it independently", () => {
    const result = premiumPreviewPlacement(
        { left: 200, right: 800, top: 400, bottom: 550 },
        { width: 1000, height: 1000 },
        { width: 440, height: 800 },
    );
    expect(result.maxHeight).toBeGreaterThanOrEqual(800);
    expect(result.left + 440).toBeLessThanOrEqual(988);
    expect(result.top + 800).toBeLessThanOrEqual(988);
});

test("short hovers retain room above/below their trigger and stay clear of the viewport edges", () => {
    const below = premiumPreviewPlacement(
        { left: 50, right: 110, top: 100, bottom: 160 },
        { width: 1280, height: 900 },
        { width: 440, height: 300 },
    );
    expect(below.top).toBe(170);
    const above = premiumPreviewPlacement(
        { left: 1200, right: 1260, top: 790, bottom: 850 },
        { width: 1280, height: 900 },
        { width: 440, height: 650 },
    );
    expect(above.top + 650).toBeLessThanOrEqual(780);
    expect(above.left + 440).toBeLessThanOrEqual(1268);
});

test("content taller than a small viewport keeps the whole available height and bounded scrolling", () => {
    const result = premiumPreviewPlacement(
        { left: 170, right: 230, top: 270, bottom: 330 },
        { width: 375, height: 640 },
        { width: 351, height: 900 },
    );
    expect(result).toEqual({ left: 12, top: 12, maxHeight: 616 });
});
