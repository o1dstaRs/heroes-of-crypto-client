import type { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";

export type UpNextVisibleState = Pick<IVisibleState, "upNext" | "hasFinished" | "lapNumber">;

const sameUnit = (previous: IVisibleUnit, next: IVisibleUnit): boolean =>
    Object.is(previous.id, next.id) &&
    Object.is(previous.name, next.name) &&
    Object.is(previous.smallTextureName, next.smallTextureName) &&
    Object.is(previous.amount, next.amount) &&
    Object.is(previous.teamType, next.teamType) &&
    Object.is(previous.stackPower, next.stackPower) &&
    Object.is(previous.isStackPowered, next.isStackPowered) &&
    Object.is(previous.isSkipping, next.isSkipping) &&
    Object.is(previous.isOnHourglass, next.isOnHourglass);

const sameQueue = (previous: IVisibleUnit[], next: IVisibleUnit[]): boolean => {
    if (previous.length !== (next?.length ?? 0)) return false;
    for (let index = 0; index < previous.length; index += 1) {
        if (!sameUnit(previous[index], next[index])) return false;
    }
    return true;
};

/** Copy changed queue data; repeated clock snapshots reuse the previous selection. */
export function selectUpNextVisibleState(state: UpNextVisibleState, previous?: UpNextVisibleState): UpNextVisibleState {
    const units = state.upNext;
    const sameUnits = previous !== undefined && sameQueue(previous.upNext, units);

    if (
        sameUnits &&
        Object.is(previous.hasFinished, state.hasFinished) &&
        Object.is(previous.lapNumber, state.lapNumber)
    ) {
        return previous;
    }

    return {
        hasFinished: state.hasFinished,
        lapNumber: state.lapNumber,
        upNext: sameUnits
            ? previous.upNext
            : (units ?? []).map((unit) => ({
                  id: unit.id,
                  name: unit.name,
                  smallTextureName: unit.smallTextureName,
                  amount: unit.amount,
                  teamType: unit.teamType,
                  stackPower: unit.stackPower,
                  isStackPowered: unit.isStackPowered,
                  isSkipping: unit.isSkipping,
                  isOnHourglass: unit.isOnHourglass,
              })),
    };
}
