import { expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { runAiSearchSimulation } from "./aiSearchGuard";
import { RenderableUnit, authoredIdleFrameForElapsed } from "./RenderableUnit";

test("AI rollouts update engine status without touching rendered turn indicators", () => {
    const grid = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "", 1),
            grid,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => undefined,
    );
    const refresh = mock(() => undefined);
    Object.assign(unit, { badgeContainer: {}, badgeDrawState: {}, ensureFlagStatusIndicators: refresh });
    runAiSearchSimulation(() => {
        unit.setWebMovementLocked(true);
        unit.setWebMovementLocked(false);
    });
    expect(refresh).not.toHaveBeenCalled();
    unit.setWebMovementLocked(true);
    expect(refresh).toHaveBeenCalledTimes(1);
});

test("authored idle seams tolerate absolute-clock roundoff while retaining the last pose's duration", () => {
    const durations = [
        3150, 110, 110, 110, 130, 110, 110, 110, 110, 240, 1000, 240, 110, 110, 110, 110, 130, 110, 110, 110,
    ];
    const cycle = durations.reduce((sum, value) => sum + value, 0);
    for (const started of [0.1, 123.456, 99999.999]) {
        expect(authoredIdleFrameForElapsed(started + cycle - started, durations)).toBe(0);
        expect(authoredIdleFrameForElapsed(started + cycle - 0.001 - started, durations)).toBe(durations.length - 1);
        expect(authoredIdleFrameForElapsed(started + cycle + 0.001 - started, durations)).toBe(0);
    }
});
