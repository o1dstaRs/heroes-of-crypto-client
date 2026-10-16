import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resizeBoard, type IBoardResizeSteps } from "./boardResize";

const recordingSteps = (overrides: Partial<Record<keyof IBoardResizeSteps, () => void>> = {}) => {
    const calls: string[] = [];
    const step = (name: keyof IBoardResizeSteps) => () => {
        calls.push(name);
        overrides[name]?.();
    };
    const steps: IBoardResizeSteps = {
        resizeCanvas: step("resizeCanvas"),
        resizeScene: step("resizeScene"),
        resizeLoader: step("resizeLoader"),
        fitCamera: step("fitCamera"),
    };
    return { calls, steps };
};

describe("resizeBoard", () => {
    test("resizes the canvas, then the scene and the loader, and fits the camera last", () => {
        const { calls, steps } = recordingSteps();

        resizeBoard(steps);

        expect(calls).toEqual(["resizeCanvas", "resizeScene", "resizeLoader", "fitCamera"]);
    });

    // Test server game b9dbc272: the right seat's resize threw inside the roster overlay a ranked fight never
    // builds, the camera kept its old fit while the painted floor re-laid out, and the red deployment zone
    // slid off its cells and under the right sidebar — placements there never left the browser.
    test("fits the camera even when the scene's resize throws, and still surfaces the error", () => {
        const failure = new Error("Cannot read properties of undefined (reading 'position')");
        const { calls, steps } = recordingSteps({
            resizeScene: () => {
                throw failure;
            },
        });

        expect(() => resizeBoard(steps)).toThrow(failure);
        expect(calls).toEqual(["resizeCanvas", "resizeScene", "resizeLoader", "fitCamera"]);
    });

    test("fits the camera even when the loading screen's resize throws", () => {
        const { calls, steps } = recordingSteps({
            resizeLoader: () => {
                throw new Error("loader");
            },
        });

        expect(() => resizeBoard(steps)).toThrow("loader");
        expect(calls.at(-1)).toBe("fitCamera");
    });

    test("works without a loading screen", () => {
        const { calls, steps } = recordingSteps();
        delete steps.resizeLoader;

        resizeBoard(steps);

        expect(calls).toEqual(["resizeCanvas", "resizeScene", "fitCamera"]);
    });
});

describe("where the board resize is wired", () => {
    test("the manager's window and board-box resize goes through resizeBoard, camera fit included", () => {
        const manager = readFileSync(join(import.meta.dir, "PixiGameManager.ts"), "utf8");
        const start = manager.indexOf("const onResize = () => {");
        const end = manager.indexOf("};", start);
        expect(start).toBeGreaterThan(-1);
        const body = manager.slice(start, end).replace(/\s+/g, " ");

        expect(body).toContain("resizeBoard({");
        expect(body).toContain("resizeCanvas: () => this.pixiApp!.resize(w, h)");
        expect(body).toContain("resizeScene: () => this.m_scene?.Resize(w, h)");
        expect(body).toContain("fitCamera: () => this.fitViewToWindow()");
        // A bare Resize call outside resizeBoard is exactly the sequence whose throw skipped the fit.
        expect(body.split("this.m_scene?.Resize(").length - 1).toBe(1);
    });
});
