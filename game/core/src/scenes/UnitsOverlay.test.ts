import { describe, expect, test } from "bun:test";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

import type { UnitProperties } from "@heroesofcrypto/common";

import { UnitChip } from "./UnitChip";
import {
    CREATURE_GRID_START_CELL_FRACTION,
    EXPANDED_CARD_GAP_CELL_FRACTION,
    EXPANDED_ROSTER_REFERENCE_COLUMNS,
    expandedRosterGridLayout,
    isVisibleThroughAncestor,
    MIRRORED_ROSTER_PORTRAIT_NAMES,
    PICK_CARD_ASPECT,
    TOGGLE_BUTTON_CELL_FRACTION,
    unitsOverlayTopBandLayout,
    UnitsOverlay,
} from "./UnitsOverlay";

type OverlayInternals = {
    allChips: UnitChip[];
    btnRadius: number;
    cellSize: number;
    isListExpanded: boolean;
    levelTabs: unknown[];
    maxScrollX: number;
    overlayH: number;
    overlayW: number;
    panelDisplayH: number;
    panelDisplayW: number;
    scrollTrackX: number;
    scrollTrackWidth: number;
    scrollbarThumb: { visible: boolean; x: number };
    scrollbarTrack: Container;
    scrollTrackY: number;
    scrollViewportX: number;
    scrollX: number;
    toggleBtn: Container;
    rowsContainer: Container;
    setSelectedLevel(level: number): void;
    toggleExpandedList(): void;
};

const contains = (bounds: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
    x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;

describe("UnitsOverlay chip visibility", () => {
    test("uses the chosen larger image-backed collapse control", () => {
        expect(TOGGLE_BUTTON_CELL_FRACTION).toBeCloseTo(0.88);
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;

        expect(internals.toggleBtn.children).toHaveLength(1);
        expect(internals.toggleBtn.children[0]).toBeInstanceOf(Sprite);

        overlay.destroy();
    });

    test("uses the exact 190:256 pick-card aspect ratio", () => {
        expect(PICK_CARD_ASPECT).toBeCloseTo(190 / 256);
    });

    test("fits the roster into the clipped wall band above the battlefield", () => {
        const layout = unitsOverlayTopBandLayout(1600, 900);
        expect(layout.y).toBeGreaterThan(0);
        expect(layout.x).toBeGreaterThan(0);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
        expect(layout.x + layout.width).toBeLessThanOrEqual(1600);
        expect(layout.y + layout.height).toBeLessThan(900 / 2);
    });

    test("fits every creature in the expanded roster without horizontal scrolling", () => {
        const layout = expandedRosterGridLayout(1400, 520, 16, 80);
        expect(layout.rows).toBe(2);
        expect(layout.columns).toBe(EXPANDED_ROSTER_REFERENCE_COLUMNS);
        expect(layout.width).toBeLessThanOrEqual(1400);
        expect(layout.height).toBeLessThanOrEqual(520);
        expect(layout.cardWidth / layout.cardHeight).toBeCloseTo(PICK_CARD_ASPECT);
        expect(layout.gap).toBeCloseTo(Math.max(5, 80 * EXPANDED_CARD_GAP_CELL_FRACTION));
    });

    test("keeps L3 and L4 portraits at the L1/L2 expanded size", () => {
        const l1L2 = expandedRosterGridLayout(1400, 520, 16, 80);
        const l3 = expandedRosterGridLayout(1400, 520, 12, 80);
        const l4 = expandedRosterGridLayout(1400, 520, 8, 80);

        expect(l3.cardWidth).toBeCloseTo(l1L2.cardWidth);
        expect(l3.cardHeight).toBeCloseTo(l1L2.cardHeight);
        expect(l4.cardWidth).toBeCloseTo(l1L2.cardWidth);
        expect(l4.cardHeight).toBeCloseTo(l1L2.cardHeight);
    });

    test("opens with the complete creature roster expanded", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;

        expect(internals.isListExpanded).toBe(true);
        expect(internals.panelDisplayH).toBeCloseTo(internals.overlayH);
        expect(internals.panelDisplayW).toBeLessThan(internals.overlayW);
        expect(internals.maxScrollX).toBe(0);
        expect(internals.scrollbarTrack.visible).toBe(false);
        expect(internals.scrollbarThumb.visible).toBe(false);
        expect("expandListBtn" in internals).toBe(false);

        overlay.destroy();
    });

    test("mirrors Nature and the reviewed cutouts while leaving portrait backgrounds untouched", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;
        const portraitParts = (chip: UnitChip) =>
            chip as unknown as {
                sprite: Sprite;
                portraitContainer: Container;
                portraitBackground?: Sprite;
                portraitBackgroundShade?: Graphics;
                portraitBackgroundOpacity: number;
                portraitBackgroundShadeAlpha: number;
            };

        const nature = portraitParts(internals.allChips.find((chip) => chip.nameKey === "Wolf")!);
        const life = portraitParts(internals.allChips.find((chip) => chip.nameKey === "Peasant")!);
        const chaos = portraitParts(internals.allChips.find((chip) => chip.nameKey === "Orc")!);
        const might = portraitParts(internals.allChips.find((chip) => chip.nameKey === "Centaur")!);

        expect(nature.sprite.scale.x).toBeLessThan(0);
        // Wolf's approved crop has a non-zero X offset. A crop-first mirror reverses that offset along
        // with the image so the visible card fragment is preserved rather than exposing another body area.
        expect(nature.sprite.x).toBeGreaterThan(0);
        expect(nature.portraitBackground?.scale.x).toBeGreaterThan(0);
        expect(life.sprite.scale.x).toBeGreaterThan(0);
        expect(life.portraitBackground?.scale.x).toBeGreaterThan(0);
        expect(life.portraitBackgroundOpacity).toBe(1);
        expect(chaos.portraitBackgroundOpacity).toBe(1);
        expect(nature.portraitBackgroundOpacity).toBe(1);
        expect(might.portraitBackgroundOpacity).toBe(1);
        expect(life.portraitBackgroundShadeAlpha).toBeCloseTo(0.2134, 6);
        expect(chaos.portraitBackgroundShadeAlpha).toBeCloseTo(0.2134, 6);
        expect(nature.portraitBackgroundShadeAlpha).toBeCloseTo(0.126, 6);
        expect(might.portraitBackgroundShadeAlpha).toBeCloseTo(0.126, 6);
        for (const portrait of [life, chaos, nature, might]) {
            expect(portrait.portraitContainer.getChildIndex(portrait.portraitBackgroundShade!)).toBeLessThan(
                portrait.portraitContainer.getChildIndex(portrait.sprite),
            );
        }

        for (const name of MIRRORED_ROSTER_PORTRAIT_NAMES) {
            const selected = internals.allChips.find((chip) => chip.nameKey === name)! as unknown as {
                mirrorPortraitX: boolean;
            };
            expect(selected.mirrorPortraitX).toBe(true);
        }

        for (const name of [
            "Trent",
            "Healer",
            "Pikeman",
            "Manticore",
            "Hydra",
            "Nightmare",
            "Efreet",
            "Black Dragon",
            "Abomination",
        ]) {
            const untouched = internals.allChips.find((chip) => chip.nameKey === name)! as unknown as {
                mirrorPortraitX: boolean;
            };
            expect(untouched.mirrorPortraitX).toBe(false);
        }

        overlay.destroy();
    });

    test("starts the creature viewport immediately after the level controls", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;
        const topBand = unitsOverlayTopBandLayout(1600, 900);
        const cell = Math.max(1, Math.min(topBand.width / 16, topBand.height / 4));

        expect(internals.scrollViewportX).toBeCloseTo(cell * CREATURE_GRID_START_CELL_FRACTION);

        overlay.destroy();
    });

    test("uses a square hit target for the square collapse control", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;
        const centerX = overlay.container.x + internals.toggleBtn.x;
        const centerY = overlay.container.y + internals.toggleBtn.y;

        // Near a square corner: inside the new control, but outside the former circular hit area.
        expect(overlay.hitToggle(centerX + internals.btnRadius * 0.85, centerY + internals.btnRadius * 0.85)).toBe(
            true,
        );
        expect(overlay.hitToggle(centerX + internals.btnRadius * 1.05, centerY)).toBe(false);

        overlay.destroy();
    });

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
        // Read through an asserted alias: control-flow analysis cannot see the callback assignment
        // above (it keeps `selected` narrowed to null across the call), so only a type assertion
        // widens it back for the property reads.
        const picked = selected as UnitProperties | null;
        expect(picked?.name).toBe(click!.expected.nameKey);
        expect(picked?.level).toBe(4);
        expect(picked?.size).toBe(2);

        overlay.destroy();
    });

    test("scrolls the selected roster from vertical wheel input over the overlay", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;
        internals.toggleExpandedList();
        internals.setSelectedLevel(4);

        expect(internals.maxScrollX).toBeGreaterThan(0);
        expect(internals.scrollbarTrack.visible).toBe(true);
        expect(internals.scrollbarThumb.visible).toBe(true);
        const trackBounds = internals.scrollbarTrack.getLocalBounds();
        const trackCenterY = internals.scrollTrackY + trackBounds.y + trackBounds.height * 0.5;
        expect(internals.expandListBtn.y).toBeCloseTo(trackCenterY);
        const handled = overlay.handleWheel(
            overlay.container.x + internals.scrollViewportX + 10,
            overlay.container.y + internals.overlayH * 0.5,
            0,
            120,
        );
        expect(handled).toBe(true);
        expect(internals.scrollX).toBeGreaterThan(0);

        overlay.destroy();
    });

    test("drags the visible scrollbar thumb through the forwarded pointer handlers", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;
        internals.toggleExpandedList();
        internals.setSelectedLevel(4);

        const thumbX = overlay.container.x + internals.scrollbarThumb.x + 2;
        const thumbY = overlay.container.y + internals.scrollTrackY + 2;
        expect(overlay.handlePointerDown(thumbX, thumbY)).toBe(true);
        expect(overlay.handlePointerMove(thumbX + 120, thumbY)).toBe(true);
        expect(internals.scrollX).toBeGreaterThan(0);
        expect(overlay.handlePointerUp()).toBe(true);

        overlay.destroy();
    });

    test("keeps the two-row roster expanded after removing the ALL control", () => {
        const app = {
            renderer: { height: 900, width: 1600 },
            stage: new Container(),
            ticker: { add: () => undefined, remove: () => undefined },
        } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
        const overlay = new UnitsOverlay(app, () => Texture.EMPTY);
        overlay.build();
        const internals = overlay as unknown as OverlayInternals;

        expect(internals.isListExpanded).toBe(true);
        const expandedHeight = internals.panelDisplayH;
        expect(expandedHeight).toBeCloseTo(internals.overlayH);
        expect("expandListBtn" in internals).toBe(false);
        expect(internals.isListExpanded).toBe(true);
        expect(internals.panelDisplayH).toBeCloseTo(expandedHeight);
        expect(internals.maxScrollX).toBe(0);

        const selectedRow = internals.rowsContainer.children[0] as Container;
        const visibleChips = selectedRow.children.flatMap((bucket) => (bucket as Container).children as UnitChip[]);
        const visibleChipCount = selectedRow.children.reduce(
            (sum, bucket) => sum + (bucket as Container).children.length,
            0,
        );
        expect(visibleChipCount).toBeGreaterThan(1);
        const portraitLeft = Math.min(...visibleChips.map((chip) => chip.getBounds().x)) - overlay.container.x;
        const portraitRight =
            Math.max(...visibleChips.map((chip) => chip.getBounds().x + chip.getBounds().width)) - overlay.container.x;
        const frameInnerRight = internals.panelDisplayW - internals.cellSize * 0.07;
        expect(portraitLeft - internals.scrollViewportX).toBeGreaterThanOrEqual(0);
        expect(portraitLeft - internals.scrollViewportX).toBeLessThan(internals.cellSize * 0.12);
        expect(frameInnerRight - portraitRight).toBeGreaterThanOrEqual(0);
        expect(frameInnerRight - portraitRight).toBeLessThan(internals.cellSize * 0.12);
        const rowPositions = new Set(
            selectedRow.children.flatMap((bucket) => (bucket as Container).children.map((chip) => Math.round(chip.y))),
        );
        expect(rowPositions.size).toBe(2);

        overlay.destroy();
    });
});
