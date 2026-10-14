import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { PremiumAnswer } from "./PremiumAnswer";
import { premiumSourceHref } from "./premiumSourceHref";

const render = (text: string) => renderToStaticMarkup(<PremiumAnswer text={text} />);

describe("Premium tactical answer presentation", () => {
    it("renders a comparison and a nested actionable plan without requiring blank lines", () => {
        const html = render(
            "## Your options\n| Choice | Tradeoff |\n|---|---|\n| **Hydra** | Screen the approach |\n| Angel \\| support | Preserve resurrection |\n\n1. Protect the shooters\n   - Spread against area attacks\n2. Save a charge\nThen reassess.",
        );
        expect(html).toContain("<table");
        expect(html).toContain('scope="col"');
        expect(html).toContain("<strong>Hydra</strong>");
        expect(html).toContain("Angel | support");
        expect(html).toContain("<ol");
        expect(html).toContain("<ul");
        expect(html).toContain("Then reassess.");
    });
    it("keeps incomplete streamed tables and emphasis readable", () => {
        expect(render("| Choice | Risk |\n|---|---|\n| Hydra |")).toContain("Hydra");
        expect(render("Save **Resurrect")).toContain("**Resurrect");
    });
    it("renders code and model-supplied HTML as inert text", () => {
        const html = render("<img src=x onerror=alert(1)>\n\n```\n<script>danger</script>\n```");
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
    it("opens knowledge links separately so the player stays in the match", () => {
        const html = render("[Hydra](/knowledge-base/?entry=Hydra#unit-hydra)");
        expect(html).toContain('href="https://heroesofcrypto.io/knowledge-base/?entry=Hydra#unit-hydra"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(render("[bad](javascript:alert(1))")).not.toContain("<a ");
    });
    it("keeps the screenshot's spell and unit links clickable inside bold list items", () => {
        const html = render(
            [
                "- **[Fireball](/knowledge-base/?entry=Fireball#spell-fireball) / offensive spells**: check your charges.",
                "- **[Blindness](/knowledge-base/?entry=Blindness#ability-blindness) on [Unicorn](/knowledge-base/?",
                "entry=Unicorn#unit-unicorn)**: inspect the ability.",
            ].join("\n"),
        );
        for (const [name, anchor] of [
            ["Fireball", "spell-fireball"],
            ["Blindness", "ability-blindness"],
            ["Unicorn", "unit-unicorn"],
        ]) {
            expect(html).toContain(`href="https://heroesofcrypto.io/knowledge-base/?entry=${name}#${anchor}"`);
            expect(html).toContain(`>${name}</a>`);
            expect(html).not.toContain(`[${name}]`);
        }
        expect(html.match(/<a /g)).toHaveLength(3);
        expect(html.match(/<strong><a /g)).toHaveLength(2);
        expect(html).toContain(" / offensive spells</strong>");
        expect(html.match(/target="_blank"/g)).toHaveLength(3);
    });
    it("supports emphasis around links and formatting inside link labels", () => {
        const html = render(
            "*[Fireball](/knowledge-base/?entry=Fireball)* and [**Unicorn**](/knowledge-base/?entry=Unicorn)",
        );
        expect(html).toContain("<em><a ");
        expect(html).toContain(">Fireball</a></em>");
        expect(html).toContain("<strong>Unicorn</strong></a>");
        expect(html.match(/<a /g)).toHaveLength(2);
    });
    it("keeps code inert and rejects unsafe destinations inside formatted text", () => {
        const html = render(
            "**[bad](javascript:alert) and `[Fireball](/knowledge-base/?entry=Fireball)`**\n\n*[bad](data:text/html,danger)*",
        );
        expect(html).not.toContain("<a ");
        expect(html).toContain("<code");
        expect(html).toContain("[Fireball](/knowledge-base/?entry=Fireball)");
    });
    it("rejoins a knowledge link the answer wrapped onto the next line", () => {
        const html = render(
            [
                "Healer pairs best with [Pikeman](/knowledge-base/?",
                "entry=Pikeman#unit-pikeman) as a front wall, or with [Monk]",
                "(/knowledge-base/?entry=Monk#unit-monk) if you want Blessing value.",
            ].join("\n"),
        );
        expect(html).toContain('href="https://heroesofcrypto.io/knowledge-base/?entry=Pikeman#unit-pikeman"');
        expect(html).toContain('href="https://heroesofcrypto.io/knowledge-base/?entry=Monk#unit-monk"');
        expect(html).toContain(">Pikeman</a>");
        expect(html).toContain(">Monk</a>");
        expect(html).not.toContain("[Pikeman]");
        expect(html).not.toContain("[Monk]");
        expect(html).toContain("as a front wall");
    });
    it("encodes a space in a unit name and leaves an aside that only looks like a link", () => {
        const html = render("[Dragon](/knowledge-base/?entry=Black Dragon#unit-black-dragon) and [note] (see below)");
        expect(html).toContain(
            'href="https://heroesofcrypto.io/knowledge-base/?entry=Black%20Dragon#unit-black-dragon"',
        );
        expect(html).toContain("[note] (see below)");
        expect(html.match(/<a /g)).toHaveLength(1);
    });
    it("does not rewrite a wrapped link inside a code sample", () => {
        const html = render("```\n[Pikeman](/knowledge-base/?\nentry=Pikeman#unit-pikeman)\n```");
        expect(html).not.toContain("<a ");
        expect(html).toContain("[Pikeman](/knowledge-base/?\nentry=Pikeman#unit-pikeman)");
    });
});

describe("Premium source routing", () => {
    it("uses the current site environment for absolute or relative first-party links", () => {
        expect(premiumSourceHref("/knowledge-base/?entry=Elf&lang=en#unit-elf", "https://heroesofcrypto.io")).toBe(
            "https://heroesofcrypto.io/knowledge-base/?entry=Elf&lang=en#unit-elf",
        );
        expect(
            premiumSourceHref("https://heroesofcrypto.io/knowledge-base/?entry=Elf", "https://test.heroesofcrypto.io"),
        ).toBe("https://test.heroesofcrypto.io/knowledge-base/?entry=Elf");
        expect(premiumSourceHref("/rules", "http://localhost:4321")).toBe("http://localhost:4321/rules");
    });
    it.each([
        "javascript:alert(1)",
        "data:text/html,danger",
        "//evil.example",
        "/\\evil.example",
        "https://user:pass@evil.example",
        "https://evil.example\n",
        "file:///etc/passwd",
    ])("rejects unsafe href %s", (href) => {
        expect(premiumSourceHref(href, "https://heroesofcrypto.io")).toBeUndefined();
    });
});
