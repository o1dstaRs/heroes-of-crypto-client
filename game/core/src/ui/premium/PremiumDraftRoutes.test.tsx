import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PremiumDraftRoutes } from "./PremiumDraftRoutes";

test("draft route cards show progress, conditional targets and competing-slot guidance", () => {
    const html = renderToStaticMarkup(
        <PremiumDraftRoutes
            remaining="L4 × 1"
            routeWarning="These routes cannot both fit."
            routes={[
                {
                    faction: "Nature",
                    label: "Nature Flying armor level 1",
                    count: 1,
                    target: 2,
                    reachable: true,
                    uncertain: true,
                    targets: [{ id: 29, name: "Gargantuan", level: 4 }],
                },
                {
                    faction: "Life",
                    label: "Life Supply level 2",
                    count: 2,
                    target: 4,
                    reachable: false,
                    uncertain: false,
                    targets: [{ id: 40, name: "Angel", level: 4 }],
                },
            ]}
        />,
    );
    expect(html).toContain('aria-label="Possible draft routes"');
    expect(html).toContain('aria-label="1 of 2 distinct creatures"');
    expect(html).toContain("Gargantuan");
    expect(html).toContain("L4");
    expect(html).toContain("future bans hidden");
    expect(html).toContain("These routes cannot both fit.");
    expect(html).toContain("Blocked by remaining levels");
    expect(html).not.toContain("Angel");
    expect(html).toContain("Only this turn’s offers are selectable now.");
});

test("no continuation cards are rendered when context is absent or the draft is complete", () => {
    expect(renderToStaticMarkup(<PremiumDraftRoutes routes={[]} />)).toBe("");
});
