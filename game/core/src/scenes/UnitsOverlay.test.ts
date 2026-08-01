import { describe, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import type { UnitProperties } from "@heroesofcrypto/common";

import { UnitChip } from "./UnitChip";
import { isVisibleThroughAncestor, UnitsOverlay } from "./UnitsOverlay";

type OverlayInternals = {
    allChips: UnitChip[];
    levelTabs: unknown[];
    rowsContainer: Container;
    setSelectedLevel(level: number): void;
};

const contains = (bounds: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
    x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;

describe("UnitsOverlay chip visibility", () => {
    test("collapsed level rows cannot answer chip hit-tests", () => {
        const rows = new Container();
        const collapsedRow = new Container();
        const bucket = new Container();
        const chip = new Container();

        rows.addChild(collapsedRow);
        collapsedRow.addChild(bucket);
        bucket.addChild(chip);

        expect(isVisibleThroughAncestor(chip, rows)).toBe(true);

        // The accordion hides the row, not each bucket or chip. Their local flags stay true and their old
        // bounds remain available, which was how hidden L1 chips intercepted visible L4 clicks.
        collapsedRow.visible = false;
        expect(chip.visible).toBe(true);
        expect(bucket.visible).toBe(true);
        expect(isVisibleThroughAncestor(chip, rows)).toBe(false);
    });

    test("only objects attached to the requested overlay branch are eligible", () => {
        const rows = new Container();
        const detachedRow = new Container();
        const bucket = new Container();
        const chip = new Container();

        detachedRow.addChild(bucket);
        bucket.addChild(chip);

        expect(isVisibleThroughAncestor(chip, rows)).toBe(false);
    });

    test("an overlapping hidden lower-level chip cannot intercept an expanded L4 chip", () => {
        // UnitsOverlay only needs these four Application members for construction/layout. A no-op ticker
        // also keeps selected chips from loading animation atlases in this geometry-only test.
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        let selected: UnitProperties | null = null;
        const overlay = new UnitsOverlay(
            app,
            () => Texture.EMPTY,
            (properties) => {
                selected = properties;
            },
        );
        overlay.build();

        const internals = overlay as unknown as OverlayInternals;
        internals.setSelectedLevel(4);
        // The tab labels contain Pixi Text, whose bounds need a browser canvas. Tabs are handled before chips,
        // but they are irrelevant to this handler assertion because the level has already been selected.
        internals.levelTabs = [];
        for (const chip of internals.allChips) chip.setSelected = () => undefined;

        const levelOf = (chip: UnitChip) =>
            internals.rowsContainer.children.indexOf(chip.parent?.parent as Container) + 1;
        const expanded = internals.allChips.filter((chip) => levelOf(chip) === 4);
        const collapsed = internals.allChips.filter(
            (chip) => levelOf(chip) < 4 && chip.visible && !!chip.parent?.visible,
        );

        let click: { expected: UnitChip; x: number; y: number } | undefined;
        for (const hidden of collapsed) {
            const hiddenBounds = hidden.getBounds();
            for (const visible of expanded) {
                const visibleBounds = visible.getBounds();
                const left = Math.max(hiddenBounds.x, visibleBounds.x);
                const right = Math.min(hiddenBounds.x + hiddenBounds.width, visibleBounds.x + visibleBounds.width);
                const top = Math.max(hiddenBounds.y, visibleBounds.y);
                const bottom = Math.min(hiddenBounds.y + hiddenBounds.height, visibleBounds.y + visibleBounds.height);
                if (right <= left || bottom <= top) continue;

                const x = (left + right) * 0.5;
                const y = (top + bottom) * 0.5;
                const expected = expanded.find((chip) => contains(chip.getBounds(), x, y));
                const intercepted = internals.allChips.find(
                    (chip) =>
                        levelOf(chip) < 4 && chip.visible && !!chip.parent?.visible && contains(chip.getBounds(), x, y),
                );
                if (expected && intercepted) {
                    click = { expected, x, y };
                    break;
                }
            }
            if (click) break;
        }

        // This overlap is the regression condition: old collapsed rows retain their previous bounds beneath
        // the newly expanded row. The old direct-parent check selected that hidden chip first.
        expect(click).toBeDefined();
        expect(overlay.handlePointerDown(click!.x, click!.y)).toBe(true);
        expect(selected?.name).toBe(click!.expected.nameKey);
        expect(selected?.level).toBe(4);
        expect(selected?.size).toBe(2);

        overlay.destroy();
    });
});
