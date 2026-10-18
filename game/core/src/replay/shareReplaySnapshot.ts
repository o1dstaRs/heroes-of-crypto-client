const plainObject = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const ownedBranches = new WeakSet<object>();
const freeze = <T extends object>(value: T): T => {
    ownedBranches.add(value);
    return Object.freeze(value);
};

const unitId = (value: unknown): unknown => {
    if (!plainObject(value)) return undefined;
    return plainObject(value.properties) ? value.properties.id : value.id;
};

/**
 * Adopt a detached snapshot, freezing it and reusing unchanged branches of its predecessor.
 * Only replay-owned snapshots may be passed here; live game objects and public mutable exports stay separate.
 * There is no global intern table: removing a replay releases its shared branches too.
 */
export const shareReplaySnapshot = <T>(next: T, previous?: T): T => share(next, previous, false) as T;

const share = (next: unknown, previous: unknown, units: boolean): unknown => {
    if (Object.is(next, previous)) return next;
    // Board and presentation converters can share children of the same detached input. A branch
    // already adopted by either checkpoint is immutable and must not be written a second time.
    if (next && typeof next === "object" && ownedBranches.has(next)) return next;
    if (Array.isArray(next)) {
        if (Object.isFrozen(next)) next = next.slice();
        const array = next as unknown[];
        const before = Array.isArray(previous) ? previous : undefined;
        const byId = units && before ? new Map(before.map((unit) => [unitId(unit), unit])) : undefined;
        let equal = before?.length === array.length;
        for (let index = 0; index < array.length; index++) {
            if (!Object.hasOwn(array, index)) {
                equal = equal && !Object.hasOwn(before!, index);
                continue;
            }
            const candidate = byId ? byId.get(unitId(array[index])) : before?.[index];
            array[index] = share(array[index], candidate, false);
            equal = equal && Object.hasOwn(before!, index) && Object.is(array[index], before?.[index]);
        }
        return equal ? before : freeze(array);
    }
    if (!plainObject(next)) return next;
    if (Object.isFrozen(next)) next = { ...next };
    const object = next as Record<string, unknown>;
    const before = plainObject(previous) ? previous : undefined;
    const keys = Object.keys(object);
    let equal = !!before && Object.keys(before).length === keys.length;
    for (const key of keys) {
        object[key] = share(object[key], before?.[key], key === "units");
        equal = equal && Object.hasOwn(before!, key) && Object.is(object[key], before![key]);
    }
    return equal ? before : freeze(object);
};
