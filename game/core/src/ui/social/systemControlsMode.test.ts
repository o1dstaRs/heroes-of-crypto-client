import { describe, expect, it } from "bun:test";

import { shouldShowSystemMenuLabel } from "./systemControlsMode";

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
