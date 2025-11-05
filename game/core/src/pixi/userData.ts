import type { Container } from "pixi.js";
import type { UnitProperties } from "@heroesofcrypto/common";

/** Our minimal “display object” surface */
export type DisplayObjectLike = Container;

/** Box2D-style wrapper */
export interface BodyLike {
    target: DisplayObjectLike;
    GetUserData(): UnitProperties | undefined;
}

/** Object → unit key (lives as long as the object) */
const OBJ_TO_KEY = new WeakMap<DisplayObjectLike, string>();

/** Key → UnitProperties (lives as long as you keep entries) */
const UNIT_STORE = new Map<string, UnitProperties>();

/** Attach the unit key to a display object */
export function attachUnitKey(obj: DisplayObjectLike, key: string): void {
    OBJ_TO_KEY.set(obj, key);
}

/** Remove the key association from a display object (optional cleanup) */
export function detachUnitKey(obj: DisplayObjectLike): void {
    OBJ_TO_KEY.delete(obj);
}

/** Register/update UnitProperties for a key */
export function registerUnit(key: string, props: UnitProperties): void {
    UNIT_STORE.set(key, props);
}

/** Delete UnitProperties for a key (optional cleanup) */
export function unregisterUnit(key: string): void {
    UNIT_STORE.delete(key);
}

/** Resolve UnitProperties from a display object (via its attached key) */
export function getUnitFromObject(obj: DisplayObjectLike): UnitProperties | undefined {
    const key = OBJ_TO_KEY.get(obj);
    return key ? UNIT_STORE.get(key) : undefined;
}

/** Convenience: wrap a display object like a Box2D body with GetUserData() */
export function makeBodyLike(obj: DisplayObjectLike): BodyLike {
    return {
        target: obj,
        GetUserData: () => getUnitFromObject(obj),
    };
}
