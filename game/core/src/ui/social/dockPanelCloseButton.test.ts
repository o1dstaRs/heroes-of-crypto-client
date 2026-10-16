import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const panelSource = (file: string): string => readFileSync(join(import.meta.dir, file), "utf8");

const PANELS = ["SocialDockRuntime.tsx", "PredictionsPanel.tsx", "ConversationPanel.tsx"];

describe("dock panels share one compact header", () => {
    test("no panel brings back a full-width Close button", () => {
        for (const file of PANELS) {
            const source = panelSource(file);
            expect({
                file,
                handRolled: /<Button[^>]*>\s*\{?\s*t?\(?"?Close"?\)?\}?\s*<\/Button>/s.test(source),
            }).toEqual({ file, handRolled: false });
        }
    });

    test("every panel uses the shared header", () => {
        for (const file of PANELS) {
            expect({ file, uses: panelSource(file).includes("<DockPanelHeader") }).toEqual({ file, uses: true });
        }
    });

    test("the shared header owns the close icon", () => {
        const shell = panelSource("DockPanelShell.tsx");
        const definition = shell.slice(shell.indexOf("export const DockPanelHeader"));
        expect(definition.includes("<CloseRoundedIcon")).toBe(true);
        expect(definition.includes('aria-label={t("Close")}')).toBe(true);
    });
});
