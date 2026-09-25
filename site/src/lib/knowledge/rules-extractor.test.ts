import { describe, expect, test } from "bun:test";

import { decodeEntities, extractRuleSections, htmlToMarkdown } from "./rules-extractor";

const page = `
<html><body>
<section class="section rules-section" id="rule-loop" tabindex="-1" data-astro-cid-x>
  <div class="page-shell">
    <p class="eyebrow">Fight loop</p>
    <h3 class="rules-section-title">The match in one minute</h3>
    <p>Read a match as a chain of <strong>visible</strong> decisions &amp; <em>choices</em>, see <a href="/knowledge-base/#units">units</a>.</p>
    <figure><img src="/x.webp" alt="ignored"><figcaption><span class="badge">Captured in game</span>Live sandbox combat.</figcaption></figure>
    <ol>
      <li><span>1</span><h4>Draft</h4><p>Build a tight roster.</p></li>
      <li><span>2</span><h4>Fight</h4><p>Move, then attack.</p></li>
    </ol>
    <section class="rules-reference" aria-labelledby="ref-title">
      <h4 id="ref-title">Key numbers</h4>
      <dl>
        <div><dt><strong>16 × 16</strong><span>battlefield cells</span></dt><dd>The battlefield is a 16×16 grid.</dd></div>
        <div><dt><strong>8</strong><span>stack cap</span></dt><dd>Placement raises the cap.</dd></div>
      </dl>
    </section>
    <svg viewBox="0 0 10 10"><polygon points="1,1 2,2"/><text>svg noise</text></svg>
    <script>window.noise = 1;</script>
    <table>
      <caption>Augment effects by tier</caption>
      <thead><tr><th scope="col">Augment</th><th scope="col">Tier 1</th></tr></thead>
      <tbody><tr><th scope="row"><img><div><strong>Armor</strong><em>% armor</em><p>Team armor.</p></div></th><td>+6% / +6</td></tr></tbody>
    </table>
    <table><tbody><tr><td>+3</td><td>Move closer | centroid</td></tr><tr><td>-4</td><td>Stack wiped</td></tr></tbody></table>
    <ul><li>Watch the queue.<ul><li>Nested tip</li></ul></li><li>Respect the edge.</li></ul>
  </div>
</section>
<section class="section rules-band" id="rule-victory">
  <p class="eyebrow">Victory</p>
  <h3>Keep your army on the board</h3>
  <p>You win when the enemy has no living stacks.</p>
</section>
<section id="rules-not-a-rule"><p>Helper block outside the prefix.</p></section>
</body></html>`;

describe("rules extractor", () => {
    test("decodes entities", () => {
        expect(decodeEntities("a &amp; b &#39;c&#x27; &nbsp;d &lt;e&gt; &unknown;")).toBe("a & b 'c'  d <e> &unknown;");
    });

    test("extracts every rule section with its title, eyebrow and markdown body", () => {
        const sections = extractRuleSections(page);
        expect(sections.map((section) => section.id)).toEqual(["rule-loop", "rule-victory"]);
        const loop = sections[0];
        expect(loop.title).toBe("The match in one minute");
        expect(loop.eyebrow).toBe("Fight loop");
        expect(loop.markdown.startsWith("### The match in one minute")).toBe(true);
        expect(loop.markdown).not.toContain("Fight loop\n\n###");
        expect(loop.markdown).toContain(
            "Read a match as a chain of **visible** decisions & *choices*, see [units](/knowledge-base/#units).",
        );
        expect(loop.markdown).toContain("Captured in game Live sandbox combat.");
        expect(loop.markdown).toContain("1. **Draft** Build a tight roster.");
        expect(loop.markdown).toContain("2. **Fight** Move, then attack.");
        expect(loop.markdown).toContain("#### Key numbers");
        expect(loop.markdown).toContain("- **16 × 16 battlefield cells**: The battlefield is a 16×16 grid.");
        expect(loop.markdown).toContain("- **8 stack cap**: Placement raises the cap.");
        expect(loop.markdown).not.toContain("svg noise");
        expect(loop.markdown).not.toContain("noise = 1");
        expect(loop.markdown).toContain(
            "**Augment effects by tier**\n\n| Augment | Tier 1 |\n| --- | --- |\n| **Armor** *% armor* · Team armor. | +6% / +6 |",
        );
        expect(loop.markdown).toContain(
            "|  |  |\n| --- | --- |\n| +3 | Move closer \\| centroid |\n| -4 | Stack wiped |",
        );
        expect(loop.markdown).toContain("- Watch the queue.\n  - Nested tip\n- Respect the edge.");
        expect(sections[1].markdown).toBe(
            "### Keep your army on the board\n\nYou win when the enemy has no living stacks.",
        );
    });

    test("keeps unrelated blocks and broken markup from producing sections", () => {
        expect(extractRuleSections('<section id="rule-open"><p>never closed')).toEqual([]);
        expect(extractRuleSections(page, "rules-")).toHaveLength(1);
    });

    test("htmlToMarkdown handles headings, inline code and breaks", () => {
        expect(htmlToMarkdown("<h2>Title</h2><p>Use <code>Hourglass</code> to<br>wait.</p><hr><p>End</p>")).toBe(
            "## Title\n\nUse `Hourglass` to wait.\n\n---\n\nEnd",
        );
    });
});
