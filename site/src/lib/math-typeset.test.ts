/**
 * The contract between the three files that put a formula on screen, held together by nothing else.
 *
 * markdown-lite marks a formula up, math-typeset finds those marks and typesets them, and
 * KnowledgeBasePage styles them and decides when the KaTeX chunk is fetched at all. They agree only on a
 * class name and an attribute, and the site has no typecheck (see ranked-match-contract.test.ts for what
 * that costs), so a rename in one of them would simply stop typesetting formulas — silently, since the
 * fallback is the raw TeX, which still looks deliberate.
 *
 * math-typeset itself cannot be imported here: it pulls in KaTeX's stylesheet, which only a bundler reads.
 * So this scans source text, the same way the wire-contract test does.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderInline } from "./markdown-lite";

const read = (...parts: string[]): string => readFileSync(join(import.meta.dir, "..", ...parts), "utf8");

describe("formula typesetting contract", () => {
    const typeset = read("lib", "math-typeset.ts");
    const page = read("components", "KnowledgeBasePage.astro");

    test("the mark the renderer emits is the one the typesetter looks for", () => {
        const inline = renderInline("$E = 1$");
        const display = renderInline("$$E = 1$$");
        expect(inline).toContain('class="kb-math" data-tex="E = 1"');
        expect(display).toContain('class="kb-math kb-math--display"');

        // The selector and the display-mode test, exactly as the typesetter writes them.
        expect(typeset).toContain('querySelectorAll<HTMLElement>("[data-tex]")');
        expect(typeset).toContain('node.classList.contains("kb-math--display")');
        expect(typeset).toContain("node.dataset.tex");
    });

    test("untrusted model output cannot reach out of the formula", () => {
        // KaTeX must not throw on bad TeX (the rest of the answer still has to render) and must not honour
        // \href or \includegraphics, which is what trust:false disables.
        expect(typeset).toContain("throwOnError: false");
        expect(typeset).toContain("trust: false");
        // And the renderer escapes before it marks up, so the TeX can never carry markup of its own.
        expect(renderInline("$<img src=x onerror=alert(1)>$")).not.toContain("<img");
    });

    test("KaTeX is fetched lazily, and only for an answer that has a formula in it", () => {
        // A static import would put 250 KB of KaTeX plus its fonts on every visit to the page.
        expect(page).not.toMatch(/import\s+\{[^}]*typesetMath[^}]*\}\s+from/);
        expect(page).toContain('import("../lib/math-typeset")');
        expect(page).toContain("MATH_STARTED.test(aiMarkdown)");
        // The stylesheet has to ride in the same chunk, or the formulas render unstyled.
        expect(typeset).toContain('import "katex/dist/katex.min.css"');
    });

    test("the page styles both the typeset formula and the TeX shown until KaTeX lands", () => {
        expect(page).toContain(".kb-ai-answer .kb-math {");
        expect(page).toContain(".kb-ai-answer .kb-math--display {");
        expect(page).toContain(".kb-ai-answer .katex");
    });
});
