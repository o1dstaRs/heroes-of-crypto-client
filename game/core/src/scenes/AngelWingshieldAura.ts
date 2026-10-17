import { type GridSettings } from "@heroesofcrypto/common";
import { Container, Graphics, Mesh, MeshGeometry, Texture } from "pixi.js";
import { arachnaWebProjection } from "./ArachnaQueenWebAura";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

export const ANGEL_WINGSHIELD_TEXTURE_KEY = "vfx_angel_wingshield_floor_v1";
export const ANGEL_WINGSHIELD_ABILITY = "Arrows Wingshield Blessing";
const TAU = Math.PI * 2;
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const smooth = (v: number) => {
    const t = clamp(v);
    return t * t * (3 - 2 * t);
};

/** A global blessing covers the playable board, including after its outer rows close. */
export function angelWingshieldProjection(gs: GridSettings, narrowing = 0) {
    return arachnaWebProjection(
        { x: (gs.getMinX() + gs.getMaxX()) / 2, y: (gs.getMinY() + gs.getMaxY()) / 2 },
        { width: 0, height: 0 },
        Math.max(gs.getMaxX() - gs.getMinX(), gs.getMaxY() - gs.getMinY()) / gs.getCellSize() / 2,
        gs,
        narrowing,
    );
}

/** The shield remains still; a travelling breeze bends the outer feathers without moving the floor. */
export function angelWingshieldWind(u: number, v: number, ageMs: number): [number, number] {
    const wing = smooth((Math.abs(u - 0.5) - 0.12) / 0.18);
    const edge = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const phase = (ageMs / 3200) * TAU;
    return [
        clamp(u + Math.sin(phase - v * 8 + u * 2) * 0.014 * wing * edge),
        clamp(v + Math.sin(phase - v * 6 + u * 5) * 0.009 * wing * edge),
    ];
}

export function angelWingshieldArrow(ageMs: number, index: number) {
    const duration = 1720;
    const phase = ((Math.max(0, ageMs) + (index * duration) / 7) % duration) / duration;
    const side = index % 2 ? -1 : 1;
    const impactX = side > 0 ? 0.22 : 0.78;
    const impactY = 0.24 + ((index * 3) % 7) * 0.075;
    const startX = side > 0 ? 0.015 : 0.985;
    const startY = clamp(impactY + ((index % 3) - 1) * 0.15, 0.05, 0.95);
    const flight = clamp(phase / 0.62);
    const broken = phase >= 0.62;
    const breakTime = clamp((phase - 0.62) / 0.38);
    return {
        phase,
        side,
        broken,
        breakTime,
        impactX,
        impactY,
        x: startX + (impactX - startX) * flight,
        y: startY + (impactY - startY) * flight,
        angle: Math.atan2(impactY - startY, impactX - startX),
        alpha: broken ? (1 - breakTime) ** 1.5 : smooth(phase / 0.08),
    };
}

type Aura = { mesh: Mesh<MeshGeometry>; arrows: Graphics; started: number; seen: number };
const owners = new WeakMap<Container, Map<string, Aura>>();
export function resetAngelWingshieldAuras(container?: Container, now = performance.now()): void {
    if (!container) return;
    const entries = owners.get(container);
    if (!entries) return;
    for (const [id, aura] of entries) {
        aura.mesh.visible = aura.arrows.visible = false;
        if (now - aura.seen > 5000) {
            aura.mesh.destroy();
            aura.arrows.destroy();
            entries.delete(id);
        }
    }
}

export function drawAngelWingshieldAura(
    container: Container | undefined,
    texture: Texture | undefined,
    gs: GridSettings,
    ownerId: string,
    alpha: number,
    narrowing = 0,
    now = performance.now(),
): void {
    if (!container || !texture || texture === Texture.EMPTY || !(alpha > 0)) return;
    const projection = angelWingshieldProjection(gs, narrowing);
    if (!projection) return;
    let entries = owners.get(container);
    if (!entries) owners.set(container, (entries = new Map()));
    let aura = entries.get(ownerId);
    if (!aura) {
        const geometry = new MeshGeometry(projection);
        const mesh = new Mesh({ texture, geometry });
        mesh.label = "angel-wingshield-floor";
        mesh.eventMode = "none";
        mesh.visible = false;
        mesh.once("destroyed", () => geometry.destroy());
        const arrows = new Graphics();
        arrows.eventMode = "none";
        arrows.label = "angel-wingshield-breaking-arrows";
        container.addChild(mesh, arrows);
        aura = { mesh, arrows, started: now, seen: now };
        entries.set(ownerId, aura);
    }
    if (aura.mesh.visible) return;
    aura.seen = now;
    const age = now - aura.started;
    const reveal = smooth(age / 650);
    const { mesh, arrows } = aura;
    mesh.visible = arrows.visible = true;
    mesh.texture = texture;
    mesh.alpha = alpha * reveal * 0.34;
    mesh.geometry.positions.set(projection.positions);
    mesh.geometry.getBuffer("aPosition").update();
    for (let i = 0; i < projection.uvs.length; i += 2) {
        const uv = angelWingshieldWind(projection.uvs[i], projection.uvs[i + 1], age);
        mesh.geometry.uvs[i] = uv[0];
        mesh.geometry.uvs[i + 1] = uv[1];
    }
    mesh.geometry.getBuffer("aUV").update();
    arrows.clear();
    arrows.alpha = alpha * reveal;
    const cell = gs.getCellSize();
    const inset = narrowing * cell;
    const project = (u: number, v: number) =>
        projectBattlefieldPoint(
            {
                x: clamp(gs.getMinX() + u * (gs.getMaxX() - gs.getMinX()), gs.getMinX() + inset, gs.getMaxX() - inset),
                y: clamp(gs.getMaxY() - v * (gs.getMaxY() - gs.getMinY()), gs.getMinY() + inset, gs.getMaxY() - inset),
            },
            gs,
        );
    const line = (x: number, y: number, angle: number, length: number, opacity: number, head: boolean) => {
        const dx = Math.cos(angle),
            dy = Math.sin(angle);
        const tail = project(x - dx * length, y - dy * length),
            tip = project(x, y);
        arrows
            .moveTo(tail.x, tail.y)
            .lineTo(tip.x, tip.y)
            .stroke({ width: cell * 0.038, color: 0x77512d, alpha: opacity });
        arrows
            .moveTo(tail.x, tail.y)
            .lineTo(tip.x, tip.y)
            .stroke({ width: cell * 0.012, color: 0xffe1a0, alpha: opacity });
        if (head) {
            const a = project(x - dx * 0.021 + dy * 0.008, y - dy * 0.021 - dx * 0.008);
            const b = project(x - dx * 0.021 - dy * 0.008, y - dy * 0.021 + dx * 0.008);
            arrows.poly([tip.x, tip.y, a.x, a.y, b.x, b.y]).fill({ color: 0xf2e5bf, alpha: opacity });
            for (const side of [-1, 1]) {
                const f = project(x - dx * length + dy * 0.008 * side, y - dy * length - dx * 0.008 * side);
                const n = project(x - dx * (length - 0.025), y - dy * (length - 0.025));
                arrows.poly([tail.x, tail.y, f.x, f.y, n.x, n.y]).fill({ color: 0xc0b397, alpha: opacity });
            }
        }
    };
    for (let i = 0; i < 7; i++) {
        const arrow = angelWingshieldArrow(age, i);
        if (!arrow.broken) line(arrow.x, arrow.y, arrow.angle, 0.095, arrow.alpha * 0.8, true);
        else {
            const t = arrow.breakTime;
            for (let piece = 0; piece < 3; piece++) {
                const spin = (piece - 1) * 3.8 * t + arrow.side * t * 2;
                line(
                    arrow.x - arrow.side * t * (0.04 + piece * 0.025),
                    arrow.y + (piece - 1) * t * 0.075 + t * t * 0.04,
                    arrow.angle + spin,
                    0.027,
                    arrow.alpha * 0.75,
                    piece === 0,
                );
            }
            if (t < 0.3) {
                const flash = project(arrow.impactX, arrow.impactY);
                arrows
                    .circle(flash.x, flash.y, cell * 0.09 * (1 + t * 2))
                    .fill({ color: 0xfff0bd, alpha: (1 - t / 0.3) * 0.7 });
            }
        }
    }
}
