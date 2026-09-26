/**
 * How many buff or debuff icons fit on one line of the sidebar.
 * `wellWidth` is the row's inner width, `tile` the icon edge, `gap` the space between icons.
 */
export const effectIconsPerLane = (wellWidth: number, tile: number, gap: number): number => {
    if (wellWidth <= 0 || tile <= 0) return 1;
    return Math.max(1, Math.floor((wellWidth + gap) / (tile + gap)));
};

/** Height of an effect well that shows `lanes` wrapping rows, plus the scrollbar chrome once. */
export const effectLaneWellHeight = (lanes: number, tile: number, gap: number, chrome: number): number => {
    const rows = Math.max(1, Math.floor(lanes));
    return tile * rows + gap * (rows - 1) + chrome;
};

export interface EffectLanePlan {
    buffLanes: number;
    debuffLanes: number;
}

/**
 * Extra lanes only for a row that does not fit on one line, and only as many as the free
 * vertical space can hold. The row that is further over capacity takes the next free line.
 */
export const planEffectLanes = (args: {
    perLane: number;
    buffItems: number;
    debuffItems: number;
    extraSlots: number;
}): EffectLanePlan => {
    const perLane = Math.max(1, Math.floor(args.perLane));
    const extraNeeded = (count: number): number => Math.max(0, Math.ceil(Math.max(0, count) / perLane) - 1);
    let buffNeed = extraNeeded(args.buffItems);
    let debuffNeed = extraNeeded(args.debuffItems);
    let buffExtra = 0;
    let debuffExtra = 0;
    let left = Math.max(0, Math.floor(args.extraSlots));
    while (left > 0 && (buffExtra < buffNeed || debuffExtra < debuffNeed)) {
        const buffShort = buffNeed - buffExtra;
        const debuffShort = debuffNeed - debuffExtra;
        if (buffShort >= debuffShort && buffShort > 0) buffExtra += 1;
        else if (debuffShort > 0) debuffExtra += 1;
        else break;
        left -= 1;
    }
    return { buffLanes: 1 + buffExtra, debuffLanes: 1 + debuffExtra };
};
