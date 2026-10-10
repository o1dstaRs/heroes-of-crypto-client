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
