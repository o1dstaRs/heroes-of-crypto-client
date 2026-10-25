export type SpiderPose = { x: number; y: number; sourceX: number; sourceY: number; angle: number };
type Point = { x: number; y: number };
export type FootReach = { centers: Point[]; radius: number };
type AttachFoot = (point: Point, reach?: FootReach) => Point;
const PERIOD = 330;
const STANCE = 0.58;
const TAU = Math.PI * 2;
const rotate = (p: Point, angle: number): Point => ({
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});
const blend = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Rest-space touchdown and stance timing, also used to excite the silk. */
export function arachnaSpiderStep(
    index: number,
    leg: number,
    sideIndex: number,
    time: number,
    poseAt: (index: number, age: number) => SpiderPose,
    attach: AttachFoot = (p) => p,
) {
    const side = sideIndex === 0 ? -1 : 1;
    const size = 27 + (index % 3) * 2;
    const offset = (((leg + sideIndex) % 2) * PERIOD) / 2 + index * 31;
    const cycleStart = Math.floor((time + offset) / PERIOD) * PERIOD - offset;
    const phase = (time - cycleStart) / PERIOD;
    const restToe = { x: side * (0.59 + 0.065 * Math.sin(leg * 0.9)), y: -0.76 + leg * 0.49 };
    const contact = (start: number) => {
        const at = poseAt(index, start + PERIOD * STANCE * 0.5);
        const r = rotate({ x: restToe.x * size, y: restToe.y * size }, at.angle);
        const begin = poseAt(index, start),
            end = poseAt(index, start + PERIOD * STANCE);
        return attach(
            { x: at.sourceX + r.x, y: at.sourceY + r.y },
            {
                centers: [
                    { x: begin.sourceX, y: begin.sourceY },
                    { x: end.sourceX, y: end.sourceY },
                ],
                radius: size * 0.88,
            },
        );
    };
    const planted = phase < STANCE;
    const swing = Math.max(0, (phase - STANCE) / (1 - STANCE));
    const ease = swing * swing * (3 - 2 * swing);
    const touchdown = contact(cycleStart);
    const rest = blend(touchdown, contact(cycleStart + PERIOD), ease);
    const load = planted ? Math.sin((Math.PI * phase) / STANCE) ** 0.8 : 0;
    return {
        rest,
        touchdown,
        previous: contact(cycleStart - PERIOD),
        planted,
        swing,
        load,
        impactAge: time - cycleStart,
        cycleStart,
        period: PERIOD,
    };
}

/** Fixed-length two-link leg. The outward solution keeps elbows away from the torso. */
export function spiderKnee(hip: Point, ankle: Point, upper: number, lower: number, side: number): Point {
    const dx = ankle.x - hip.x,
        dy = ankle.y - hip.y;
    const distance = Math.max(0.0001, Math.hypot(dx, dy));
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));
    const outward = side;
    return {
        x: hip.x + (dx / distance) * along - (dy / distance) * height * outward,
        y: hip.y + (dy / distance) * along + (dx / distance) * height * outward,
    };
}

/** Deterministic articulated pose: contacts follow the web, never the body rocking. */
export function arachnaSpiderRig(
    index: number,
    time: number,
    poseAt: (index: number, age: number) => SpiderPose,
    windAt: (x: number, y: number, age: number) => Point,
    attach: AttachFoot = (p) => p,
) {
    const pose = poseAt(index, time);
    const size = 27 + (index % 3) * 2;
    const windPhase = (time / 5600) * TAU + index * 0.79;
    const walkPhase = (time / PERIOD) * TAU + index * 1.8;
    const speed = Math.abs(Math.sin((time / (6800 + index * 370)) * TAU + index * 1.37));
    const shift = {
        x: 0.095 * Math.sin(windPhase) + 0.025 * Math.sin(walkPhase) * speed,
        y: 0.043 * Math.cos(windPhase) + 0.015 * Math.cos(walkPhase * 2) * speed,
    };
    const yaw = 0.115 * Math.sin(windPhase) + 0.025 * Math.sin(walkPhase) * speed;
    const roll = 0.24 * Math.sin(windPhase + 0.3);
    const abdomenLag = 0.105 * Math.sin(windPhase - 0.72);
    const abdomenYaw = yaw + 0.15 * Math.sin(windPhase - 0.72);
    const bodyPoint = (p: Point) => {
        const r = rotate(p, yaw);
        return { x: r.x + shift.x, y: r.y + shift.y };
    };
    const legs = [];
    for (let leg = 0; leg < 4; leg++)
        for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
            const side = sideIndex === 0 ? -1 : 1;
            const { planted, swing, rest } = arachnaSpiderStep(index, leg, sideIndex, time, poseAt, attach);
            const wind = windAt(rest.x, rest.y, time);
            const relative = rotate({ x: rest.x + wind.x - pose.x, y: rest.y + wind.y - pose.y }, -pose.angle);
            const lift = Math.sin(swing * Math.PI) * 0.075;
            const toe = { x: relative.x / size, y: relative.y / size - lift };
            const hip = bodyPoint({ x: side * 0.105, y: -0.2 + leg * 0.087 });
            const reach = Math.hypot(hip.x - toe.x, hip.y - toe.y);
            const ankle = blend(toe, hip, 0.085 / Math.max(0.0001, reach));
            // Long anterior/posterior legs, shorter middle pairs. Lengths stay fixed.
            const upper = leg === 0 || leg === 3 ? 0.62 : 0.58;
            const lower = upper;
            const knee = spiderKnee(hip, ankle, upper, lower, leg < 2 ? side : -side);
            legs.push({ hip, knee, ankle, toe, planted, upper, lower, rest, lift });
        }
    return { shift, yaw, roll, abdomenLag, abdomenYaw, legs };
}
