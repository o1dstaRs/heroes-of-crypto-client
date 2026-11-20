import type { Container } from "pixi.js";

export type FlagOverlayAnchor = Readonly<{ x: number; y: number; unitId?: string }>;
type Anchor = FlagOverlayAnchor;
export type FlagOverlayAttach = (container: Container, zIndex: number, follow: () => Anchor | undefined) => void;

export interface FlagNumber {
    container: Container;
    flagAnchor?: Anchor;
    /** Authored upper extent, including text stroke and shadow; avoids measuring text on impact. */
    topExtent?: number;
    /** Authored half width; measuring Pixi text per frame would redo the canvas/font work prewarm removes. */
    halfWidth?: number;
}

/** Repeated flag numbers sit in 160 px columns, so one number fits within half of that either side. */
export const FLAG_NUMBER_HALF_WIDTH = 80;

interface FlagOverlay {
    container: Container;
    follow: () => Anchor | undefined;
    lowerExtent?: number;
    /** Once a cue shares its flag with damage it moves beside the numbers, and stays there until it ends. */
    side?: -1 | 1;
    /** Distance from the flag centre to this side's inner edge; it only grows, so expiry never slides cues in. */
    clearance?: number;
}

/**
 * Effect cues sit in one centred row just above their flag. While damage numbers own that space, cues move
 * to the numbers' left and right at the same height instead of climbing above them, so they never float
 * several cells away from their unit.
 */
export class FlagOverlayLayout {
    private overlays: FlagOverlay[] = [];
    public add(container: Container, follow: () => Anchor | undefined): void {
        this.overlays.push({ container, follow });
    }
    public clear(): void {
        this.overlays.length = 0;
    }
    public update(numbers: readonly FlagNumber[], gap: number, board?: Readonly<{ minX: number; maxX: number }>): void {
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
            // Horizontal extent of this flag's live damage, relative to the flag centre. Numbers are captured
            // at contact, so measure them against their own anchor; a returning responder keeps its cues close.
            let numbersLeft = Infinity,
                numbersRight = -Infinity;
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
                const half = (number.halfWidth ?? FLAG_NUMBER_HALF_WIDTH) * Math.abs(number.container.scale.x);
                const centre = number.container.x - number.flagAnchor.x;
                numbersLeft = Math.min(numbersLeft, centre - half);
                numbersRight = Math.max(numbersRight, centre + half);
            }
            const damaged = numbersLeft <= numbersRight;
            const bounds = overlays.map((overlay) => {
                const { container } = overlay;
                const b = container.getLocalBounds();
                const left = Math.min(b.minX * container.scale.x, b.maxX * container.scale.x);
                const right = Math.max(b.minX * container.scale.x, b.maxX * container.scale.x);
                // Animated cels and captions may change bounds; they must not move the cue's origin.
                const lower = (overlay.lowerExtent ??= Math.min(
                    b.minY * container.scale.y,
                    b.maxY * container.scale.y,
                ));
                return { overlay, container, left, width: right - left, lower };
            });
            const bottom = anchor.y + gap;
            if (damaged) {
                // Each new cue takes the side with more free room, so a stack at the board edge flanks inward.
                // Without board bounds the emptier side wins; ties start on the left.
                const room = (side: -1 | 1) => {
                    const used = bounds
                        .filter((other) => other.overlay.side === side)
                        .reduce((sum, other) => sum + other.width + gap, 0);
                    const clearance = side < 0 ? -numbersLeft : numbersRight;
                    const limit = board ? (side < 0 ? anchor.x - board.minX : board.maxX - anchor.x) : 0;
                    return limit - clearance - used;
                };
                for (const b of bounds) {
                    if (b.overlay.side) continue;
                    b.overlay.side = room(1) > room(-1) ? 1 : -1;
                }
            }
            const centred = bounds.filter((b) => !b.overlay.side);
            const width = centred.reduce((sum, b) => sum + b.width, 0) + gap * Math.max(0, centred.length - 1);
            let x = anchor.x - width / 2;
            for (const b of centred) {
                b.container.position.set(x - b.left, bottom - b.lower);
                x += b.width + gap;
            }
            for (const side of [-1, 1] as const) {
                const flank = bounds.filter((b) => b.overlay.side === side);
                if (!flank.length) continue;
                const current = damaged ? (side < 0 ? -numbersLeft : numbersRight) : 0;
                const clearance = Math.max(current, ...flank.map((b) => b.overlay.clearance ?? 0), 0);
                let edge = anchor.x + side * (clearance + gap);
                for (const b of flank) {
                    b.overlay.clearance = clearance;
                    const left = side < 0 ? edge - b.width : edge;
                    b.container.position.set(left - b.left, bottom - b.lower);
                    edge += side * (b.width + gap);
                }
            }
        }
    }
}
