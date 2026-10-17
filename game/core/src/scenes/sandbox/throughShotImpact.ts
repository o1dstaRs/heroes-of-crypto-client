import type { HoCMath } from "@heroesofcrypto/common";

export function throughShotImpactProgress<T>(
    from: HoCMath.XY,
    to: HoCMath.XY,
    hits: readonly { value: T; position: HoCMath.XY; radius: number }[],
    onImpact: (value: T) => void,
): (progress: number) => void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const contacts = hits
        .map((hit) => ({
            value: hit.value,
            progress:
                distance > 0
                    ? Math.max(
                          0,
                          Math.min(
                              1,
                              ((hit.position.x - from.x) * dx + (hit.position.y - from.y) * dy) /
                                  (distance * distance) -
                                  hit.radius / distance,
                          ),
                      )
                    : 0,
        }))
        .sort((left, right) => left.progress - right.progress);
    let next = 0;
    return (progress) => {
        while (next < contacts.length && contacts[next].progress <= progress) {
            onImpact(contacts[next++].value);
        }
    };
}
