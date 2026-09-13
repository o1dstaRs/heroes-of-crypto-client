import { describe, expect, test } from "bun:test";

import { PlayInputSource } from "../api/play_protocol";
import { noteInput, takeInputTelemetry } from "./inputTelemetry";

describe("input telemetry", () => {
    test("counts pointer presses since the last action, remembers the last input kind, and resets the count", () => {
        takeInputTelemetry();
        noteInput("pointer");
        noteInput("pointer");
        noteInput("keyboard");

        const first = takeInputTelemetry();
        expect(first.pointerEvents).toBe(2);
        expect(first.inputSource).toBe(PlayInputSource.KEYBOARD);
        expect(first.tabHidden).toBe(false);

        const second = takeInputTelemetry();
        expect(second.pointerEvents).toBe(0);
        expect(second.inputSource).toBe(PlayInputSource.KEYBOARD);
    });
});
