import type { IGameRuntime } from "@heroesofcrypto/common";

export const createMcpGameRuntime = (): IGameRuntime => {
    let nowMillis = 1_000;
    let idCounter = 0;

    return {
        rng: {
            int: (min) => min,
        },
        clock: {
            nowMillis: () => {
                nowMillis += 100;
                return nowMillis;
            },
        },
        ids: {
            nextId: () => {
                idCounter += 1;
                return `mcp-${idCounter}`;
            },
        },
    };
};
