import { afterEach, expect, spyOn, test } from "bun:test";
import { HoCLib } from "@heroesofcrypto/common";
import { AIController, type IAIContext } from "./AIController";

const restores: (() => void)[] = [];
afterEach(() => restores.splice(0).forEach((restore) => restore()));
const fixture = () => {
    let now = 1000;
    const clock = spyOn(HoCLib, "getTimeMillis").mockImplementation(() => now);
    const warning = spyOn(console, "warn").mockImplementation(() => {});
    restores.push(
        () => clock.mockRestore(),
        () => warning.mockRestore(),
    );
    const controller = new AIController({ getCurrentActiveUnit: () => undefined } as unknown as IAIContext);
    return {
        controller,
        warning,
        advance: (ms: number) => {
            now += ms;
        },
    };
};

test("an attack, reaction and response can exceed ten seconds without releasing the AI action", () => {
    const { controller, warning, advance } = fixture();
    controller.performingAction = true;
    controller.noteActionPresentationProgress();
    for (let phase = 0; phase < 6; phase++) {
        advance(4000);
        controller.shouldTriggerAI();
        expect(controller.performingAction).toBe(true);
        controller.noteActionPresentationProgress();
    }
    expect(warning).not.toHaveBeenCalled();
    controller.destroy();
});

test("the watchdog still recovers an action that makes no further presentation progress", () => {
    const { controller, warning, advance } = fixture();
    controller.performingAction = true;
    controller.noteActionPresentationProgress();
    advance(10001);
    controller.shouldTriggerAI();
    expect(controller.performingAction).toBe(false);
    expect(warning).toHaveBeenCalledTimes(1);
    controller.shouldTriggerAI();
    expect(warning).toHaveBeenCalledTimes(1);
    controller.destroy();
});

test("idle or destroyed presentation callbacks cannot re-arm AI execution", () => {
    const { controller, warning, advance } = fixture();
    controller.noteActionPresentationProgress();
    controller.destroy();
    controller.noteActionPresentationProgress();
    advance(20000);
    expect(controller.shouldTriggerAI()).toBe(false);
    expect(controller.performingAction).toBe(false);
    expect(warning).not.toHaveBeenCalled();
});
