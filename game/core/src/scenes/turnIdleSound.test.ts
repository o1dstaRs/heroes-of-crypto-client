import { expect, test } from "bun:test";

import { TurnIdleSound } from "./turnIdleSound";

const setup = () => {
    const started: Array<{ name: string; unitId: string; alive: () => boolean; stopped: number }> = [];
    let sceneAlive = true;
    const idle = new TurnIdleSound(
        (name, unitId, alive) => {
            const entry = { name, unitId, alive, stopped: 0 };
            // The real loop refuses to start unless `alive` already holds when it is called.
            expect(alive()).toBe(true);
            started.push(entry);
            return () => {
                entry.stopped++;
            };
        },
        () => sceneAlive,
    );
    return { idle, started, destroyScene: () => (sceneAlive = false) };
};

test("the thinking creature's loop starts once and stays alive while its turn waits", () => {
    const { idle, started } = setup();
    idle.sync({ id: "dragon", name: "Black Dragon" });
    idle.sync({ id: "dragon", name: "Black Dragon" });
    expect(started.map(({ name }) => name)).toEqual(["Black Dragon"]);
    expect(started[0].alive()).toBe(true);
    expect(idle.unitId).toBe("dragon");
});

test("acting, the next turn and the end of the fight each stop the loop exactly once", () => {
    const { idle, started } = setup();
    idle.sync({ id: "dragon", name: "Black Dragon" });
    idle.sync(undefined); // the dragon starts its strike
    expect(started[0].stopped).toBe(1);
    expect(started[0].alive()).toBe(false); // a slow decode can no longer start it
    idle.sync({ id: "dragon", name: "Black Dragon" }); // a second action in the same turn waits again
    idle.sync({ id: "hyena", name: "Hyena" }); // the next creature's turn
    expect(started.map(({ unitId, stopped }) => [unitId, stopped])).toEqual([
        ["dragon", 1],
        ["dragon", 1],
        ["hyena", 0],
    ]);
    idle.clear();
    idle.clear();
    expect(started[2].stopped).toBe(1);
    expect(idle.unitId).toBeUndefined();
});

test("a destroyed scene can no longer start a pending loop", () => {
    const { idle, started, destroyScene } = setup();
    idle.sync({ id: "dragon", name: "Black Dragon" });
    destroyScene();
    expect(started[0].alive()).toBe(false);
});
