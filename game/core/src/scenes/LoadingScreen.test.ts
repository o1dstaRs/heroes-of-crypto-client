import { expect, test } from "bun:test";

import { loadingMedallionXForProgress } from "./LoadingScreen";

test("loading medallion follows the intended path between the ornate track ends", () => {
    expect(loadingMedallionXForProgress(0)).toBe(500);
    expect(loadingMedallionXForProgress(0.5)).toBe(850);
    expect(loadingMedallionXForProgress(1)).toBe(1200);
});
