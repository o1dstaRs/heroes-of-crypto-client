import { describe, expect, test } from "bun:test";

import { renderInline, renderMarkdown } from "./markdown-lite";

describe("markdown-lite", () => {
    test("escapes HTML before adding markup", () => {
        expect(renderMarkdown("<script>alert(1)</script> & **bold**")).toBe(
            "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; <strong>bold</strong></p>",
        );
        expect(renderInline('`<b>` and "quotes"')).toBe("<code>&lt;b&gt;</code> and &quot;quotes&quot;");
    });

    test("renders links only to safe destinations", () => {
        expect(renderInline("[Hydra](/knowledge-base/?entry=Hydra#unit-hydra)")).toBe(
            '<a href="/knowledge-base/?entry=Hydra#unit-hydra">Hydra</a>',
        );
        expect(renderInline("[docs](https://heroesofcrypto.io/faq/)")).toBe(
            '<a href="https://heroesofcrypto.io/faq/" target="_blank" rel="noopener noreferrer">docs</a>',
        );
        expect(renderInline("[x](javascript:alert(1))")).toBe("[x](javascript:alert(1))");
        expect(renderInline("[x](//evil.example)")).toBe("[x](//evil.example)");
    });

    test("renders headings, lists, tables, quotes, code and rules", () => {
        const html = renderMarkdown(
            [
                "# Title",
                "",
                "Intro *em* and _also em_ with `code`.",
                "",
                "- one",
                "- two **bold**",
                "  - nested",
                "1. first",
                "2. second",
                "",
                "| Unit | HP |",
                "|---|---|",
                "| Hydra | 185 |",
                "| Angel \\| flying | 120 |",
                "",
                "> quoted",
                "",
                "```",
                "a < b",
                "```",
                "",
                "---",
            ].join("\n"),
        );
        expect(html).toContain("<h3>Title</h3>");
        expect(html).toContain("<p>Intro <em>em</em> and <em>also em</em> with <code>code</code>.</p>");
        expect(html).toContain(
            "<ul><li>one</li><li>two <strong>bold</strong><ul><li>nested</li></ul></li></ul><ol><li>first</li><li>second</li></ol>",
        );
        expect(html).toContain(
            "<table><thead><tr><th>Unit</th><th>HP</th></tr></thead><tbody><tr><td>Hydra</td><td>185</td></tr><tr><td>Angel | flying</td><td>120</td></tr></tbody></table>",
        );
        expect(html).toContain("<blockquote><p>quoted</p></blockquote>");
        expect(html).toContain("<pre><code>a &lt; b</code></pre>");
        expect(html).toContain("<hr>");
    });

    test("keeps partially streamed markdown readable", () => {
        expect(renderMarkdown("Morale is capped at **−20")).toBe("<p>Morale is capped at **−20</p>");
        expect(renderMarkdown("| Unit | HP |\n|---|---|\n| Hydra |")).toContain("<td>Hydra</td><td></td>");
        expect(renderMarkdown("")).toBe("");
    });
});
