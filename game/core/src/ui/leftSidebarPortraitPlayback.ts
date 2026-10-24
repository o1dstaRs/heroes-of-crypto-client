/** Vite adds a content hash to atlas filenames in deployed builds. */
export const sidebarPortraitSourceFile = (src: string): string => {
    const file = src.split(/[?#]/, 1)[0].split("/").pop() ?? "";
    return file.replace(/(_atlas)-[A-Za-z0-9_-]{8,}(?=\.webp$)/, "$1");
};

/** Complete source movies: never trim the turn or recovery to hide a loop defect. */
export const REFINED_LEVEL_ONE_PORTRAIT_FRAMES: Readonly<Record<string, number>> = Object.freeze({
    fairy: 100,
    dryad: 100,
    wolf: 100,
    leprechaun: 100,
    scavenger: 100,
    orc: 100,
    troglodyte: 100,
    wandering_mage: 100,
    mermaid: 100,
    berserker: 100,
    centaur: 100,
    wolf_rider: 100,
});

export const isRefinedLevelOnePortrait = (src: string): boolean => {
    const file = sidebarPortraitSourceFile(src);
    return Object.keys(REFINED_LEVEL_ONE_PORTRAIT_FRAMES).some(
        (slug) => file === `${slug}_left_screen_idle_atlas.webp`,
    );
};

/** Full-length reviewed portraits for levels two through four. */
export const REFINED_HIGHER_LEVEL_PORTRAIT_FRAMES: Readonly<Record<string, number>> = Object.freeze({
    pikeman: 100,
    valkyrie: 100,
    healer: 100,
    battle_mage: 100,
    crusader: 100,
    griffin: 100,
    monk: 100,
    tsar_cannon: 100,
    angel: 100,
    champion: 100,
    white_tiger: 100,
    elf: 100,
    satyr: 100,
    trent: 100,
    unicorn: 100,
    mantis: 100,
    pegasus: 100,
    magic_dragon: 100,
    gargantuan: 100,
    arachna_spider: 100,
    medusa: 100,
    troll: 100,
    beholder: 100,
    efreet: 100,
    goblin_knight: 100,
    black_dragon: 100,
    hydra: 100,
    abomination: 100,
    manticore: 100,
    nightmare: 100,
    nomad: 100,
    harpy: 100,
    hyena: 100,
    wyvern: 100,
    ogre_mage: 100,
    cyclops: 100,
    zena: 100,
    behemoth: 100,
    frenzied_boar: 100,
});

export const REFINED_PORTRAIT_FRAMES: Readonly<Record<string, number>> = Object.freeze({
    ...REFINED_LEVEL_ONE_PORTRAIT_FRAMES,
    ...REFINED_HIGHER_LEVEL_PORTRAIT_FRAMES,
});

export const isRefinedPortrait = (src: string): boolean => {
    const file = sidebarPortraitSourceFile(src);
    return Object.keys(REFINED_PORTRAIT_FRAMES).some((slug) => file === `${slug}_left_screen_idle_atlas.webp`);
};

/** Authored forward loops retain their duration and begin when the image is ready. */
export const createForwardPortraitClock = (frameCount: number, fps: number) => {
    let origin: number | undefined;
    const count = Math.max(1, frameCount);
    const frameMs = 1000 / Math.max(0.01, fps);
    return (timestamp: number): number => {
        origin ??= timestamp;
        return Math.floor(Math.max(0, timestamp - origin) / frameMs) % count;
    };
};

/** One intact pose at a time, with neither endpoint repeated at the turnaround. */
export const createPortraitIdleClock = (frameCount: number, fps: number, cycleDurationMs?: number) => {
    let origin: number | undefined;
    const last = Math.max(0, frameCount - 1);
    const period = Math.max(1, last * 2);
    // Preserve the original full runtime duration while visiting each endpoint only once.
    const frameMs =
        cycleDurationMs !== undefined && Number.isFinite(cycleDurationMs) && cycleDurationMs > 0
            ? cycleDurationMs / period
            : 1000 / Math.max(0.01, fps);
    return (timestamp: number): number => {
        origin ??= timestamp;
        const step = Math.floor(Math.max(0, timestamp - origin) / frameMs) % period;
        return step <= last ? step : period - step;
    };
};

/** Hydra's source slows at both ends. Shorten those holds without blending poses or cutting frames. */
export const createHydraPortraitIdleClock = (frameCount: number, fps: number, cycleDurationMs?: number) => {
    const count = Math.max(1, Math.floor(frameCount));
    if (count === 1) return createPortraitIdleClock(1, fps, cycleDurationMs);
    const last = count - 1;
    const period = last * 2;
    const cycleMs =
        cycleDurationMs !== undefined && Number.isFinite(cycleDurationMs) && cycleDurationMs > 0
            ? cycleDurationMs
            : (period * 1000) / Math.max(0.01, fps);
    // A gradual six-frame ramp avoids a speed step on either side of each turn.
    const turnWeights = [0.25, 0.4, 0.55, 0.7, 0.85, 0.95];
    const frames = Array.from({ length: period }, (_, step) => (step <= last ? step : period - step));
    let total = 0;
    const ends = frames.map((frame) => {
        total += turnWeights[Math.min(frame, last - frame)] ?? 1;
        return total;
    });
    const boundaries = ends.map((end) => (end / total) * cycleMs);
    let origin: number | undefined;
    return (timestamp: number): number => {
        origin ??= timestamp;
        const elapsed = Math.max(0, timestamp - origin) % cycleMs;
        let lo = 0;
        let hi = period - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (elapsed < boundaries[mid]) hi = mid;
            else lo = mid + 1;
        }
        return frames[lo];
    };
};
