import { afterEach, describe, expect, test } from "bun:test";

import { installFootprintOverridesFromSearch } from "./footprintOverridesFromUrl";

const holder = globalThis as { __hocFootprintOverrides?: string };

afterEach(() => {
    delete holder.__hocFootprintOverrides;
});

describe("footprint overrides from the URL", () => {
    test("installs the engine override string, decoding the URL encoding", () => {
        const installed = installFootprintOverridesFromSearch("?footprints=White%20Tiger%3D1x2,Peasant%3D2x1");
        expect(installed).toBe("White Tiger=1x2,Peasant=2x1");
        expect(holder.__hocFootprintOverrides).toBe("White Tiger=1x2,Peasant=2x1");
    });

    test("plus-encoded spaces decode the same way a browser form encodes them", () => {
        installFootprintOverridesFromSearch("?footprints=White+Tiger=1x2");
        expect(holder.__hocFootprintOverrides).toBe("White Tiger=1x2");
    });

    test("an absent or empty parameter leaves a console-set override untouched", () => {
        holder.__hocFootprintOverrides = "Peasant=2x1";
        expect(installFootprintOverridesFromSearch("?foo=bar")).toBeUndefined();
        expect(holder.__hocFootprintOverrides).toBe("Peasant=2x1");
        expect(installFootprintOverridesFromSearch("?footprints=")).toBeUndefined();
        expect(holder.__hocFootprintOverrides).toBe("Peasant=2x1");
    });
});
