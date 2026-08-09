export interface PlacementStackPowerInput {
    id: string;
    experience: number;
    amount: number;
}

export interface PlacementSplitPowerProjection {
    unitPowers: ReadonlyMap<string, number>;
    splitPower: number;
}

/** Mirrors FightProperties.setUnitsCalculatedStacksPower without mutating the live placement roster. */
const stackPowerForTotalExperience = (totalExperience: number, maxTotalExperience: number): number => {
    const percentage = (totalExperience / maxTotalExperience) * 100;
    if (percentage <= 20) return 1;
    if (percentage <= 40) return 2;
    if (percentage <= 60) return 3;
    if (percentage <= 80) return 4;
    return 5;
};

/**
 * Project every visible stack's power after replacing one source stack with its two split halves.
 *
 * The denominator has to be recalculated too: splitting the strongest stack can promote unrelated stacks,
 * so copying the source's current pips or scaling against the old maximum cannot match the committed state.
 */
export function projectPlacementSplitStackPowers(
    stacks: readonly PlacementStackPowerInput[],
    sourceId: string,
    splitAmount: number,
): PlacementSplitPowerProjection | undefined {
    const source = stacks.find((stack) => stack.id === sourceId);
    if (
        !source ||
        !Number.isSafeInteger(splitAmount) ||
        splitAmount < 1 ||
        splitAmount >= source.amount ||
        !Number.isFinite(source.experience) ||
        source.experience <= 0
    ) {
        return undefined;
    }

    const projectedTotals = stacks.map((stack) => ({
        id: stack.id,
        totalExperience: stack.experience * (stack.id === sourceId ? stack.amount - splitAmount : stack.amount),
    }));
    const splitTotalExperience = source.experience * splitAmount;
    const maxTotalExperience = Math.max(splitTotalExperience, ...projectedTotals.map((stack) => stack.totalExperience));
    if (!Number.isFinite(maxTotalExperience) || maxTotalExperience <= 0) return undefined;

    return {
        unitPowers: new Map(
            projectedTotals.map((stack) => [
                stack.id,
                stackPowerForTotalExperience(stack.totalExperience, maxTotalExperience),
            ]),
        ),
        splitPower: stackPowerForTotalExperience(splitTotalExperience, maxTotalExperience),
    };
}
