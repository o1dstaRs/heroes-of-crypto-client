import { expect, test } from "bun:test";
import { FightProperties, TeamVals, type TeamType } from "@heroesofcrypto/common";

import { syncRankedAlreadyMadeTurn } from "./RankedPlayScene";

const LEFT = TeamVals.LEFT as TeamType;
const RIGHT = TeamVals.RIGHT as TeamType;
const unit = (id: string, team: TeamType, extra: { dead?: boolean; onHourglass?: boolean } = {}) => ({
    id,
    team,
    dead: false,
    onHourglass: false,
    ...extra,
});
const units = [
    unit("gargantuan", LEFT),
    unit("unicorn", LEFT),
    unit("pegasus", RIGHT),
    unit("wolf", RIGHT),
    unit("medusa", LEFT),
    unit("peasant", LEFT, { onHourglass: true }),
    unit("fallen", LEFT, { dead: true }),
];
type Snapshot = Parameters<typeof syncRankedAlreadyMadeTurn>[1];

// Game d6d7ee8b (2026-11-26): the Gargantuan acted in lap 1, the client marked it, nothing cleared the mark at
// the lap change, and Wait stayed disabled on its lap-2 turn although the server would have accepted it.
test("each ranked snapshot rebuilds made-turn: last lap's actor is free again, this lap's actors are done", () => {
    const fp = new FightProperties();
    fp.addAlreadyMadeTurn(LEFT, "gargantuan", 0);
    syncRankedAlreadyMadeTurn(fp, {
        fightStarted: true,
        currentUnitId: "gargantuan",
        upNext: ["wolf", "medusa"],
        units,
    } as unknown as Snapshot);
    const made = (id: string) => fp.hasAlreadyMadeTurn(id);
    expect(made("gargantuan")).toBe(false);
    // Acted earlier this lap per the server.
    expect(made("unicorn")).toBe(true);
    expect(made("pegasus")).toBe(true);
    // Still to act: queued, or parked on the hourglass.
    expect(made("wolf")).toBe(false);
    expect(made("medusa")).toBe(false);
    expect(made("peasant")).toBe(false);
    expect(made("fallen")).toBe(false);
});

test("before the fight starts the made-turn set is left alone", () => {
    const fp = new FightProperties();
    fp.addAlreadyMadeTurn(LEFT, "gargantuan", 0);
    syncRankedAlreadyMadeTurn(fp, {
        fightStarted: false,
        currentUnitId: "",
        upNext: [],
        units,
    } as unknown as Snapshot);
    expect(fp.hasAlreadyMadeTurn("gargantuan")).toBe(true);
});
