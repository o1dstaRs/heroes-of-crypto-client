/** Presentation-only world facing; a visible scene owns the roster until it is released. */
export type BattleUnitFacing = -1 | 1;
interface FacingUnit {
    getId(): string;
    getBoardFacingDirection?(): BattleUnitFacing;
}
let owner: object | undefined;
const facings = new Map<string, BattleUnitFacing>();
const listeners = new Map<string, Set<() => void>>();
const notify = (id: string): void => {
    for (const listener of [...(listeners.get(id) ?? [])]) listener();
};
export const getBattleUnitFacing = (id?: string): BattleUnitFacing | undefined => (id ? facings.get(id) : undefined);
export const subscribeBattleUnitFacing = (id: string | undefined, listener: () => void): (() => void) => {
    if (!id) return () => {};
    const unitListeners = listeners.get(id) ?? new Set<() => void>();
    listeners.set(id, unitListeners);
    unitListeners.add(listener);
    return () => {
        unitListeners.delete(listener);
        if (!unitListeners.size) listeners.delete(id);
    };
};
export function publishBattleUnitFacings(scene: object, units: Iterable<FacingUnit>): void {
    if (owner !== scene) {
        const previous = [...facings.keys()];
        facings.clear();
        owner = scene;
        for (const id of previous) notify(id);
    }
    for (const unit of units) {
        const facing = unit.getBoardFacingDirection?.();
        if (facing === undefined || facings.get(unit.getId()) === facing) continue;
        facings.set(unit.getId(), facing);
        notify(unit.getId());
    }
    // Keep a fallen unit's last pose available to an inspected portrait until this scene ends.
}
export function releaseBattleUnitFacings(scene: object): void {
    if (owner !== scene) return;
    owner = undefined;
    const previous = [...facings.keys()];
    facings.clear();
    for (const id of previous) notify(id);
}
