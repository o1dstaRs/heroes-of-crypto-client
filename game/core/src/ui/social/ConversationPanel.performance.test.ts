import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("conversation background work", () => {
    test("fully disarms message polling while the tab is hidden", () => {
        const source = readFileSync(join(import.meta.dir, "ConversationPanel.tsx"), "utf8");

        expect(source).toContain("startVisibleInterval");
        expect(source).not.toContain("window.setInterval");
    });
});
