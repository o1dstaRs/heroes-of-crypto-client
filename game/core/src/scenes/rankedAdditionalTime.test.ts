import { describe, expect, test } from "bun:test";

import { FightProperties, FightStateManager, TeamVals, type TeamType } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { RankedPlayScene } from "./RankedPlayScene";

/**
 * "Use additional time" is offered from the server's snapshot (field 74), not the ranked client's own
 * FightProperties: those never learn that the team already asked this lap, so the button came back on the
 * team's next unit and the request was refused as additional_time_not_available (production logs).
 */

interface AdditionalTimeScene {
    sc_visibleState: { canRequestAdditionalTime: boolean; teamTypeTurn?: TeamType; lapNumber?: number };
    applyRankedAdditionalTime: (snapshot: AuthoritativeGameSnapshot) => void;
    additionalTimeOnOffer: (team: TeamType) => boolean;
    refreshVisibleStateIfNeeded: (force: boolean) => void;
}

const sceneFor = (viewerTeam: TeamType): AdditionalTimeScene =>
    Object.assign(Object.create(RankedPlayScene.prototype), {
        viewerTeam,
        sc_visibleState: { canRequestAdditionalTime: true },
        sc_visibleStateUpdateNeeded: false,
    }) as AdditionalTimeScene;

const snapshot = (overrides: Partial<AuthoritativeGameSnapshot>): AuthoritativeGameSnapshot =>
    ({
        fightStarted: true,
        fightFinished: false,
        currentTurnTeam: TeamVals.LEFT,
        ...overrides,
    }) as AuthoritativeGameSnapshot;

describe("ranked additional time follows the server's answer", () => {
    test("the button shows on the viewer's turn only while the server would grant the time", () => {
        const scene = sceneFor(TeamVals.LEFT);

        scene.applyRankedAdditionalTime(snapshot({ additionalTimeMs: 12_000 }));
        expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(true);
        expect(scene.additionalTimeOnOffer(TeamVals.LEFT)).toBe(true);
        expect(scene.additionalTimeOnOffer(TeamVals.RIGHT)).toBe(false);

        scene.applyRankedAdditionalTime(snapshot({ additionalTimeMs: 0 }));
        expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(false);
        expect(scene.additionalTimeOnOffer(TeamVals.LEFT)).toBe(false);
    });

    test("never on the opponent's turn, or before the fight starts", () => {
        const scene = sceneFor(TeamVals.LEFT);

        scene.applyRankedAdditionalTime(snapshot({ currentTurnTeam: TeamVals.RIGHT, additionalTimeMs: 12_000 }));
        expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(false);

        scene.applyRankedAdditionalTime(snapshot({ fightStarted: false, additionalTimeMs: 12_000 }));
        expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(false);
    });

    test("a forced rebuild of the visible state (a melee/ranged switch mid-turn) keeps the offer", () => {
        const manager = FightStateManager.getInstance();
        const shared = manager.getFightProperties();
        const fightProps = new FightProperties();
        fightProps.startFight();
        manager.setFightProperties(fightProps);
        try {
            const scene = sceneFor(TeamVals.LEFT);
            scene.sc_visibleState = { teamTypeTurn: TeamVals.LEFT, canRequestAdditionalTime: true, lapNumber: 1 };
            scene.applyRankedAdditionalTime(snapshot({ additionalTimeMs: 12_000 }));

            scene.refreshVisibleStateIfNeeded(true);

            expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(true);
        } finally {
            manager.setFightProperties(shared);
        }
    });

    test("an older server's snapshot, which never carries the answer, leaves the button alone", () => {
        const scene = sceneFor(TeamVals.LEFT);

        scene.applyRankedAdditionalTime(snapshot({}));
        expect(scene.sc_visibleState.canRequestAdditionalTime).toBe(true);
    });
});
