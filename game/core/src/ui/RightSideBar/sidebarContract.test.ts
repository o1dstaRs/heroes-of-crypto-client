import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * Source-contract tripwires for the sandbox right sidebar.
 *
 * This repo has no DOM test harness, and the regression class these guard against is exactly the one a
 * render test would catch: a visual rework rewrites a sidebar file wholesale and silently drops a control.
 * That already happened once — the Aug 2026 restyle replaced FightControlToggler and lost the Army
 * section's UnitSplitter, taking the Split (S) and Delete (D) buttons out of the sandbox. These tests
 * read the source, so a rework that removes a control fails a NAMED test instead of shipping quietly;
 * whoever restyles the sidebar updates the contract here consciously or reinstates the control.
 */

const read = (...segments: string[]): string => readFileSync(join(import.meta.dir, ...segments), "utf8");

describe("sandbox right-sidebar contract", () => {
    test("the Army section renders the UnitSplitter with a Split handler wired to the manager", () => {
        const toggler = read("FightControlToggler.tsx");
        expect(toggler).toContain('import UnitSplitter from "./UnitSplitter"');
        expect(toggler).toMatch(/<UnitSplitter\s[^>]*onSplit=\{handleSplit\}/);
        expect(toggler).toContain("manager.Split(group1)");
    });

    test("the UnitSplitter carries both the Split and Delete controls with their shortcuts", () => {
        const splitter = read("UnitSplitter.tsx");
        expect(splitter).toContain('title="Split (S)"');
        expect(splitter).toContain('title="Delete (D)"');
        expect(splitter).toContain("manager.Delete()");
        // The S/D keyboard shortcuts stay registered (and stay off editable targets).
        expect(splitter).toContain('window.addEventListener("keydown", handleActionShortcut');
        expect(splitter).toContain("isEditableShortcutTarget");
    });

    test("the app entry installs URL footprint overrides before anything builds a unit", () => {
        const entry = read("..", "index.tsx");
        expect(entry).toContain("installFootprintOverridesFromSearch(window.location.search)");
    });
});
