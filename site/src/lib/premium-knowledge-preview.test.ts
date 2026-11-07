import { expect, test } from "bun:test";
import { buildKnowledgeGraph } from "./knowledge/graph-builder";
import { findKnowledgePreview, knowledgeReference, renderKnowledgePreview } from "./premium-knowledge-preview";

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
