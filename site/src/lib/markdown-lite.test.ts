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

    describe("formulas", () => {
        test("marks up each delimiter the assistant may use, keeping the TeX for KaTeX", () => {
            expect(renderInline("Expected score is $E = \\frac{1}{2}$ here.")).toBe(
                'Expected score is <span class="kb-math" data-tex="E = \\frac{1}{2}">E = \\frac{1}{2}</span> here.',
            );
            expect(renderInline("Inline \\(a + b\\) too.")).toBe(
                'Inline <span class="kb-math" data-tex="a + b">a + b</span> too.',
            );
            // The doubled delimiters win over the single `$`, and both mean "display this on its own line".
            expect(renderInline("$$K \\times (1 - E)$$")).toBe(
                '<span class="kb-math kb-math--display" data-tex="K \\times (1 - E)">K \\times (1 - E)</span>',
            );
            expect(renderInline("\\[K \\times E\\]")).toBe(
                '<span class="kb-math kb-math--display" data-tex="K \\times E">K \\times E</span>',
            );
        });

        test("a formula spanning several lines is one mark", () => {
            // The assistant writes display formulas on their own lines; paragraphs join before inline
            // markup runs, so the mark must survive that join.
            expect(renderMarkdown("$$\nE = \\frac{1}{1 + 10^{d/400}}\n$$")).toBe(
                '<p><span class="kb-math kb-math--display" data-tex="E = \\frac{1}{1 + 10^{d/400}}">E = \\frac{1}{1 + 10^{d/400}}</span></p>',
            );
        });

        test("TeX reaches the attribute escaped, and never as markup or emphasis", () => {
            const html = renderInline("$a < b$ and $x_1 * x_2$");
            expect(html).toContain('data-tex="a &lt; b"');
            // Underscores and asterisks inside a formula are TeX, not <em>.
            expect(html).toContain('data-tex="x_1 * x_2"');
            expect(html).not.toContain("<em>");
            expect(renderInline("$<img src=x onerror=alert(1)>$")).not.toContain("<img");
        });

        test("money and code stay as they are", () => {
            // Two prices in one sentence are not a formula: real TeX does not hug its delimiters with
            // spaces, and digits alone are money.
            expect(renderInline("Costs $5 and then $10 more")).toBe("Costs $5 and then $10 more");
            expect(renderInline("`$E = 1$`")).toBe("<code>$E = 1$</code>");
            expect(renderMarkdown("```\n$E = 1$\n```")).toBe("<pre><code>$E = 1$</code></pre>");
        });

        test("a half-streamed formula is left alone until its closing delimiter arrives", () => {
            expect(renderMarkdown("Expected score is $E = \\frac{1}{1 +")).toBe(
                "<p>Expected score is $E = \\frac{1}{1 +</p>",
            );
        });
    });
});
