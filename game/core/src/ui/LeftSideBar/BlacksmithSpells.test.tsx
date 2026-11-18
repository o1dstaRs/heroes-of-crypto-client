import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { BlacksmithSpells } from "./BlacksmithSpells";

test("shows remaining rune charges and keeps exhausted spells identifiable", () => {
    const html = renderToStaticMarkup(
        <BlacksmithSpells spells={["System:Armor Rune", "System:Armor Rune", "System:Weapon Rune"]} size={64} />,
    );
    expect(html).toContain('aria-label="Craft, 0 remaining"');
    expect(html).toContain('aria-label="Armor Rune, 2 remaining"');
    expect(html).toContain('aria-label="Weapon Rune, 1 remaining"');
    expect(html).toContain('alt="Craft"');
    expect(html).not.toContain('role="button"');
});
