import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Every dock panel must close with the SAME button.
 *
 * The shell is a stretch flex column, so a Button placed directly in it spans the panel's width — but one
 * wrapped in a Box shrinks to its own text. Predictions had acquired such a wrapper, and its Close came
 * out visibly smaller than the identical button on Friends and Notifications. The three had the markup
 * written out separately, which is how they drifted; DockPanelCloseButton is now the single definition.
 *
 * This pins the arrangement rather than the pixels: no panel may hand-roll a Close button again.
 */
const panelSource = (file: string): string => readFileSync(join(import.meta.dir, file), "utf8");

const PANELS = ["SocialDockRuntime.tsx", "PredictionsPanel.tsx"];

describe("dock panels share one close button", () => {
    test("no panel hand-rolls its own Close button", () => {
        for (const file of PANELS) {
            const source = panelSource(file);
            // A Button whose body is the word Close — the shape that drifted.
            expect({
                file,
                handRolled: /<Button[^>]*>\s*\{?\s*t?\(?"?Close"?\)?\}?\s*<\/Button>/s.test(source),
            }).toEqual({ file, handRolled: false });
        }
    });

    test("every panel closes through the shared component", () => {
        for (const file of PANELS) {
            expect({ file, uses: panelSource(file).includes("<DockPanelCloseButton") }).toEqual({ file, uses: true });
        }
    });

    test("the shared button is a direct child of the shell, which is what makes it full width", () => {
        const shell = panelSource("DockPanelShell.tsx");
        // Its own definition must not reintroduce the wrapper that caused the shrink.
        const definition = shell.slice(shell.indexOf("export const DockPanelCloseButton"));
        expect(definition.includes("<Box")).toBe(false);
        expect(definition.includes("<Button")).toBe(true);
    });
});
