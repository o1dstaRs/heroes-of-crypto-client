import { describe, expect, it } from "bun:test";

import { GAME_SYSTEM_CONTROL_SIZE_PX, GAME_SYSTEM_CONTROLS_STACK_GAP_PX } from "../GameSystemControls";
import {
    shouldShowSystemMenuLabel,
    SYSTEM_DOCK_BUTTON_SIZE_PX,
    SYSTEM_DOCK_GAP_PX,
    SYSTEM_DOCK_STEP_PX,
    SYSTEM_MENU_ITEM_OFFSETS,
} from "./systemControlsMode";

describe("system controls label visibility", () => {
    it("hides the master hint immediately when the fan opens", () => {
        expect(shouldShowSystemMenuLabel(false, "System controls")).toBe(true);
        expect(shouldShowSystemMenuLabel(true, "System controls")).toBe(false);
    });

    it("keeps child-button hints available while the fan is open", () => {
        expect(shouldShowSystemMenuLabel(true, "Friends")).toBe(true);
        expect(shouldShowSystemMenuLabel(true, undefined)).toBe(false);
    });
});

describe("system controls fan geometry", () => {
    const master = { left: 0, right: SYSTEM_DOCK_BUTTON_SIZE_PX, top: 0, bottom: SYSTEM_DOCK_BUTTON_SIZE_PX };
    const childRect = ({ x, y }: Readonly<{ x: number; y: number }>) => ({
        // A child fills the master's own box and a negative CSS X translation carries it left — away
        // from the bottom-right corner the master occupies.
        left: x,
        right: SYSTEM_DOCK_BUTTON_SIZE_PX + x,
        top: y,
        bottom: SYSTEM_DOCK_BUTTON_SIZE_PX + y,
    });
    const overlaps = (
        left: Readonly<{ left: number; right: number; top: number; bottom: number }>,
        right: Readonly<{ left: number; right: number; top: number; bottom: number }>,
    ): boolean =>
        left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;

    it("keeps every opened child clear of the master medallion and its siblings", () => {
        const children = Object.values(SYSTEM_MENU_ITEM_OFFSETS).map(childRect);
        for (const child of children) {
            expect(overlaps(child, master)).toBe(false);
        }
        for (let left = 0; left < children.length; left += 1) {
            for (let right = left + 1; right < children.length; right += 1) {
                expect(overlaps(children[left], children[right])).toBe(false);
            }
        }
    });

    it("opens the three controls on one aligned row", () => {
        const centers = Object.values(SYSTEM_MENU_ITEM_OFFSETS).map(({ y }) => y + SYSTEM_DOCK_BUTTON_SIZE_PX / 2);
        expect(new Set(centers).size).toBe(1);
    });

    it("stays on the master's own line, so the open dock is one row ending at fullscreen", () => {
        for (const { y } of Object.values(SYSTEM_MENU_ITEM_OFFSETS)) {
            expect(y).toBe(0);
        }
    });

    it("opens away from the corner the medallion occupies", () => {
        for (const { x } of Object.values(SYSTEM_MENU_ITEM_OFFSETS)) {
            expect(x).toBeLessThan(0);
        }
    });

    it("is built from the corner controls' own square and gap", () => {
        expect(SYSTEM_DOCK_BUTTON_SIZE_PX).toBe(GAME_SYSTEM_CONTROL_SIZE_PX);
        expect(SYSTEM_DOCK_GAP_PX).toBe(GAME_SYSTEM_CONTROLS_STACK_GAP_PX);
        expect(SYSTEM_DOCK_STEP_PX).toBe(GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX);
    });

    it("spaces the children one control apart, nearest first", () => {
        expect(SYSTEM_MENU_ITEM_OFFSETS.notifications.x).toBe(-SYSTEM_DOCK_STEP_PX);
        expect(SYSTEM_MENU_ITEM_OFFSETS.friends.x).toBe(-2 * SYSTEM_DOCK_STEP_PX);
        expect(SYSTEM_MENU_ITEM_OFFSETS.predictions.x).toBe(-3 * SYSTEM_DOCK_STEP_PX);
    });
});
