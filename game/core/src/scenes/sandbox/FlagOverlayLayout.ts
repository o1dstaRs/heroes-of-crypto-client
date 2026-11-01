import type { Container } from "pixi.js";

export type FlagOverlayAnchor = Readonly<{ x: number; y: number; unitId?: string }>;
type Anchor = FlagOverlayAnchor;
export type FlagOverlayAttach = (container: Container, zIndex: number, follow: () => Anchor | undefined) => void;

export interface FlagNumber {
    container: Container;
    flagAnchor?: Anchor;
    /** Authored upper extent, including text stroke and shadow; avoids measuring text on impact. */
    topExtent?: number;
}

/** One horizontal row per flag, above the current upper edge of its floating results. */
export class FlagOverlayLayout {
    private overlays: { container: Container; follow: () => Anchor | undefined }[] = [];
    public add(container: Container, follow: () => Anchor | undefined): void {
        this.overlays.push({ container, follow });
    }
    public clear(): void {
        this.overlays.length = 0;
    }
    public update(numbers: readonly FlagNumber[], gap: number): void {
        this.overlays = this.overlays.filter(({ container }) => !container.destroyed);
        const groups = new Map<string, { anchor: Anchor; containers: Container[] }>();
        for (const { container, follow } of this.overlays) {
            if (!container.visible || !container.renderable) continue;
            const anchor = follow();
            if (!anchor) continue;
            const key = anchor.unitId ?? `${anchor.x}:${anchor.y}`;
            let group = groups.get(key);
            if (!group) groups.set(key, (group = { anchor, containers: [] }));
            group.containers.push(container);
        }
        for (const { anchor, containers } of groups.values()) {
            let bottom = anchor.y + gap;
            for (const number of numbers) {
                if (!number.flagAnchor || number.container.destroyed) continue;
                // Identity keeps a responding/moving stack's stable number anchor and live flag together.
                // Position is only a fallback for detached labels without a presentation owner.
                const sameFlag =
                    number.flagAnchor.unitId && anchor.unitId
                        ? number.flagAnchor.unitId === anchor.unitId
                        : Math.abs(number.flagAnchor.x - anchor.x) <= gap * 2 &&
                          Math.abs(number.flagAnchor.y - anchor.y) <= gap * 2;
                if (!sameFlag) continue;
                bottom = Math.max(
                    bottom,
                    number.container.y + (number.topExtent ?? 36) * Math.abs(number.container.scale.y) + gap,
                );
            }
            const bounds = containers.map((container) => {
                const b = container.getLocalBounds();
                const left = Math.min(b.minX * container.scale.x, b.maxX * container.scale.x);
                const right = Math.max(b.minX * container.scale.x, b.maxX * container.scale.x);
                const lower = Math.min(b.minY * container.scale.y, b.maxY * container.scale.y);
                return { container, left, width: right - left, lower };
            });
            const width = bounds.reduce((sum, b) => sum + b.width, 0) + gap * (bounds.length - 1);
            let x = anchor.x - width / 2;
            for (const b of bounds) {
                b.container.position.set(x - b.left, bottom - b.lower);
                x += b.width + gap;
            }
        }
    }
}
