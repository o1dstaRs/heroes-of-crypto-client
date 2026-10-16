export interface ArenaPopulation {
    searching: number;
    playing: number;
    online: number;
}

/** Queue heartbeats are newer than the cached population poll; use them for both arena readouts. */
export const reconcileArenaPopulation = (
    population: ArenaPopulation | undefined,
    liveQueueSize: number | null,
): ArenaPopulation | undefined => {
    if (!population || liveQueueSize === null) {
        return population;
    }
    return {
        searching: liveQueueSize,
        playing: population.playing,
        online: liveQueueSize + population.playing,
    };
};
