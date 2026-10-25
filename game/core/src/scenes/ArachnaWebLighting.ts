import { Container, type Sprite } from "pixi.js";

export const WEB_LIGHT_COUNT = 5;
const lighting = new WeakMap<Container, Float32Array>();
const unlit = new Float32Array(WEB_LIGHT_COUNT * 4);
/** Sample visible fire sprites AFTER their real animation and layout have updated.
 * Screen coordinates follow viewport, mirror and editor changes automatically.
 */
export function publishWebFireLights(stage: Container, fires: Iterable<Sprite>): void {
    let values = lighting.get(stage);
    if (!values) lighting.set(stage, (values = new Float32Array(WEB_LIGHT_COUNT * 4)));
    values.fill(0);
    let index = 0;
    for (const fire of fires) {
        if (index >= WEB_LIGHT_COUNT) break;
        let visible = true;
        let strength = 1;
        for (let p: Container | null = fire; p; p = p.parent) {
            if (!p.visible || p.alpha <= 0) visible = false;
            strength *= p.alpha;
        }
        if (!visible || fire.destroyed) continue;
        const position = fire.getGlobalPosition();
        values.set(
            [position.x, position.y - fire.height * 0.35, Math.max(32, fire.height * 1.5), strength],
            index++ * 4,
        );
    }
}
export function webFireLights(container: Container): Float32Array {
    let root = container;
    while (root.parent) root = root.parent;
    return lighting.get(root) ?? unlit;
}
