export type AugmentSelections = Readonly<{
    placement: number;
    armor: number;
    might: number;
    empower: number;
    sniper: number;
    movement: number;
}>;

export const remainingAugmentPoints = (budgetPoints: number, selections: AugmentSelections): number =>
    Math.max(
        0,
        budgetPoints -
            selections.placement -
            selections.armor -
            selections.might -
            selections.empower -
            selections.sniper -
            selections.movement,
    );
