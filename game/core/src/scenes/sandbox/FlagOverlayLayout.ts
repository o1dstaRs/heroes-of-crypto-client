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

interface FlagOverlay {
    container: Container;
    follow: () => Anchor | undefined;
    bottomOffset?: number;
    lowerExtent?: number;
}

/** One horizontal row per flag, retaining its reserved height until the last cue finishes. */
export class FlagOverlayLayout {
    private overlays: FlagOverlay[] = [];
    public add(container: Container, follow: () => Anchor | undefined): void {
        this.overlays.push({ container, follow });
    }
    public clear(): void {
        this.overlays.length = 0;
    }
    public update(numbers: readonly FlagNumber[], gap: number): void {
        this.overlays = this.overlays.filter(({ container }) => !container.destroyed);
        const groups = new Map<string, { anchor: Anchor; overlays: FlagOverlay[] }>();
        for (const overlay of this.overlays) {
            const { container, follow } = overlay;
            if (!container.visible || !container.renderable) continue;
            const anchor = follow();
            if (!anchor) continue;
            const key = anchor.unitId ?? `${anchor.x}:${anchor.y}`;
            let group = groups.get(key);
            if (!group) groups.set(key, (group = { anchor, overlays: [] }));
            group.overlays.push(overlay);
        }
        for (const { anchor, overlays } of groups.values()) {
            // Damage reads for 650 ms; effects can remain for 1300 ms. Releasing its space early
            // made every surviving effect drop mid-animation. Keep the row's height relative to
            // its flag, including when that flag moves or is replaced by an authoritative snapshot.
            let bottom = anchor.y + gap;
            for (const overlay of overlays) {
                bottom = Math.max(bottom, anchor.y + (overlay.bottomOffset ?? gap));
            }
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
                    // Damage is captured at contact and may stay behind while a responder returns
                    // home. Reserve its authored height relative to its original flag, not that stale
                    // world position; otherwise a moving flag drags its effects far above the unit.
                    anchor.y +
                        (number.container.y - number.flagAnchor.y) +
                        (number.topExtent ?? 36) * Math.abs(number.container.scale.y) +
                        gap,
                );
            }
            const bounds = overlays.map((overlay) => {
                const { container } = overlay;
                overlay.bottomOffset = bottom - anchor.y;
                const b = container.getLocalBounds();
                const left = Math.min(b.minX * container.scale.x, b.maxX * container.scale.x);
                const right = Math.max(b.minX * container.scale.x, b.maxX * container.scale.x);
                // Animated cels and captions may change bounds; they must not move the cue's origin.
                const lower = (overlay.lowerExtent ??= Math.min(
                    b.minY * container.scale.y,
                    b.maxY * container.scale.y,
                ));
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
