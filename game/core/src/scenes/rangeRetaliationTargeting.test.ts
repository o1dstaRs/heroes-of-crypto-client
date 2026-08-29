import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

describe("ranged retaliation projectile targeting", () => {
    test("lands live and replay return shots at the attacking figure's visual center", () => {
        const source = sandboxSource();
        const replayResponse = source.slice(
            source.indexOf("private async playReplayRetaliation("),
            source.indexOf("private materializeReplaySummons("),
        );
        const liveResponseStart = source.indexOf("// Ranged counter: when the defender shoots back");
        const liveResponse = source.slice(liveResponseStart, source.indexOf("        } else {", liveResponseStart));

        expect(replayResponse).toContain("await this.playReplayProjectile(target, attacker);");
        expect(replayResponse).not.toContain("responseEdge");
        expect(liveResponse).toContain("const responseTarget = attacker.getVisualCenter(gs);");
        expect(liveResponse).toContain("target.getRangedProjectileOrigin(responseTarget, gs)");
        expect(liveResponse).toContain("to: responseTarget");
        expect(liveResponse).not.toContain("?.toPosition");
    });
});
