import { describe, expect, test } from "bun:test";

import { playerPortalArtifactInfo } from "./PlayerPortalPage";

describe("player portal artifact history", () => {
    test("resolves retired artifacts from the compatibility catalog", () => {
        expect(playerPortalArtifactInfo(1, 12)).toMatchObject({
            name: "Broken Aegis",
            imageKey: "artifact_t1_broken_aegis_256",
        });
    });

    test("does not invent metadata for an unknown historical id", () => {
        expect(playerPortalArtifactInfo(2, 999)).toBeUndefined();
    });
});
