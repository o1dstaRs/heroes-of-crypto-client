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
    /** Authored lower extent below the number's origin (the kill row adds to it). */
    bottomExtent?: number;
    /** Written by the layout: how far this number moved sideways so it and its cues centre on the flag. */
    shiftX?: number;
}

/** Repeated flag numbers sit in 160 px columns, so one number fits within half of that either side. */
export const FLAG_NUMBER_HALF_WIDTH = 80;

/** EffectCaption's root: a fixed word-wrap box much wider than the art it names. */
const EFFECT_CAPTION_LABEL = "effect-caption";

/**
 * A cue's art bounds without its caption, in the cue's local space. A captioned cue is about 1.9 cells wide,
 * because the caption box is; spacing and centring by that box put the icon itself well away from its flag.
 */
function artBounds(container: Container): { minX: number; maxX: number; minY: number; maxY: number } | undefined {
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for (const child of container.children) {
        if (child.label === EFFECT_CAPTION_LABEL || !child.visible) continue;
        const b = child.getLocalBounds();
        for (const x of [b.minX, b.maxX]) {
            const local = (x - child.pivot.x) * child.scale.x + child.x;
            minX = Math.min(minX, local);
            maxX = Math.max(maxX, local);
        }
        for (const y of [b.minY, b.maxY]) {
            const local = (y - child.pivot.y) * child.scale.y + child.y;
            minY = Math.min(minY, local);
            maxY = Math.max(maxY, local);
        }
    }
    return minX <= maxX && minY <= maxY ? { minX, maxX, minY, maxY } : undefined;
}

interface FlagOverlay {
    container: Container;
    follow: () => Anchor | undefined;
    lowerExtent?: number;
    /** Once a cue shares its flag with damage it moves beside the numbers, and stays there until it ends. */
    side?: -1 | 1;
    /** Distance from the flag centre to this side's inner edge; it only grows, so expiry never slides cues in. */
    clearance?: number;
    /** Beside damage the cue's art is centred on the numbers' height; kept once set. */
    dy?: number;
    /** Sideways shift that centres the numbers and their cues on the flag; set when a cue joins the row. */
    shift?: number;
    /** Art extent (scaled, without the caption), measured once: animated cels must not move the cue. */
    art?: { left: number; right: number; centreY: number };
}

/**
 * Effect cues sit in one centred row just above their flag. While damage numbers own that space, the numbers
 * and their cues form one row centred on the flag: cues sit to the numbers' right (on screen), each icon
 * vertically centred on the damage block, instead of climbing above it or hanging a cell away. Only a board
 * edge sends them to the left.
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
            // Extent of this flag's live damage relative to the flag centre, before any centring shift.
            // Numbers are captured at contact, so measure them against their own anchor; a returning
            // responder keeps its cues close.
            let numbersLeft = Infinity,
                numbersRight = -Infinity,
                centreYSum = 0;
            const own: FlagNumber[] = [];
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
                own.push(number);
                const scaleY = Math.abs(number.container.scale.y);
                const half = (number.halfWidth ?? FLAG_NUMBER_HALF_WIDTH) * Math.abs(number.container.scale.x);
                const centre = number.container.x - (number.shiftX ?? 0) - number.flagAnchor.x;
                numbersLeft = Math.min(numbersLeft, centre - half);
                numbersRight = Math.max(numbersRight, centre + half);
                // The block runs from its top extent above the origin to its bottom extent below (y-up).
                const top = (number.topExtent ?? 36) * scaleY;
                const below = (number.bottomExtent ?? 36) * scaleY;
                centreYSum += number.container.y - number.flagAnchor.y + (top - below) / 2;
            }
            const damaged = own.length > 0;
            const numbersCentreY = damaged ? centreYSum / own.length : 0;
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
                // Beside damage the art, not the caption, sets the spacing: the caption may run under the
                // numbers, so the icon itself stays next to its flag.
                // An authored bounds area is already stable; otherwise measure the art without its caption.
                const measured = (overlay.art ??= (() => {
                    const art = (!container.boundsArea && artBounds(container)) || b;
                    return {
                        left: Math.min(art.minX * container.scale.x, art.maxX * container.scale.x),
                        right: Math.max(art.minX * container.scale.x, art.maxX * container.scale.x),
                        centreY: ((art.minY + art.maxY) / 2) * container.scale.y,
                    };
                })());
                return {
                    overlay,
                    container,
                    left,
                    right,
                    artLeft: measured.left,
                    artRight: measured.right,
                    artCentreY: measured.centreY,
                    width: right - left,
                    lower,
                };
            });
            const bottom = anchor.y + gap;
            if (damaged) {
                // Cues read to the right of the damage, on screen: a mirrored board flips world x. A cue
                // moves to the left only when the board edge leaves no room for it on the right.
                const parent = overlays[0].container.parent?.getGlobalTransform?.();
                const screenRight: -1 | 1 = parent && parent.a < 0 ? -1 : 1;
                const room = (side: -1 | 1) => {
                    if (!board) return Infinity;
                    const used = bounds
                        .filter((other) => other.overlay.side === side)
                        .reduce((sum, other) => sum + other.artRight - other.artLeft + gap, 0);
                    const clearance = side < 0 ? -numbersLeft : numbersRight;
                    const limit = side < 0 ? anchor.x - board.minX : board.maxX - anchor.x;
                    // Centring on the flag moves the row back by half the cue's width; reserve the rest.
                    return limit - clearance - gap - used;
                };
                for (const b of bounds) {
                    if (b.overlay.side) continue;
                    b.overlay.side =
                        room(screenRight) >= b.artRight - b.artLeft ? screenRight : (-screenRight as -1 | 1);
                    // The icon's centre meets the damage block's centre, so the pair reads as one row.
                    b.overlay.dy = numbersCentreY - b.artCentreY;
                }
            }
            const centred = bounds.filter((b) => !b.overlay.side);
            const width = centred.reduce((sum, b) => sum + b.width, 0) + gap * Math.max(0, centred.length - 1);
            let x = anchor.x - width / 2;
            for (const b of centred) {
                b.container.position.set(x - b.left, bottom - b.lower);
                x += b.width + gap;
            }
            // Flanking cues in flag-relative x, before centring.
            const placed: { b: (typeof bounds)[number]; x: number }[] = [];
            let spanLeft = damaged ? numbersLeft : Infinity,
                spanRight = damaged ? numbersRight : -Infinity;
            for (const side of [-1, 1] as const) {
                const flank = bounds.filter((b) => b.overlay.side === side);
                if (!flank.length) continue;
                const current = damaged ? (side < 0 ? -numbersLeft : numbersRight) : 0;
                const clearance = Math.max(current, ...flank.map((b) => b.overlay.clearance ?? 0), 0);
                let edge = side * (clearance + gap);
                for (const b of flank) {
                    b.overlay.clearance = clearance;
                    // The art meets the inner edge; the next cue clears this one's caption as well.
                    const local = side < 0 ? edge - b.artRight : edge - b.artLeft;
                    placed.push({ b, x: local });
                    spanLeft = Math.min(spanLeft, local + b.artLeft);
                    spanRight = Math.max(spanRight, local + b.artRight);
                    edge += side < 0 ? -(b.artRight - b.left + gap) : b.right - b.artLeft + gap;
                }
            }
            if (!placed.length) continue;
            // Centre the numbers and their cues on the flag, as one row. The shift only grows, so a cue that
            // ends, or a number that expires, never slides the rest of the row back mid-presentation.
            let wanted = -(spanLeft + spanRight) / 2;
            if (board) {
                // Never centre the row off the board: near an edge it stays as close to centred as fits.
                const lowest = board.minX - (anchor.x + spanLeft);
                const highest = board.maxX - (anchor.x + spanRight);
                if (lowest <= highest) wanted = Math.min(highest, Math.max(lowest, wanted));
            }
            const previous = placed.find(({ b }) => b.overlay.shift !== undefined)?.b.overlay.shift;
            // The row is centred once, when a cue joins it beside live damage, and then held: animated cels
            // change their bounds every frame and must not nudge the numbers, and expiry must not slide them.
            const joined = damaged && placed.some(({ b }) => b.overlay.shift === undefined);
            const shift =
                previous === undefined ? wanted : joined && Math.abs(wanted) > Math.abs(previous) ? wanted : previous;
            for (const { b, x: local } of placed) {
                b.overlay.shift = shift;
                b.container.position.set(anchor.x + local + shift, anchor.y + (b.overlay.dy ?? gap - b.lower));
            }
            for (const number of own) {
                const previous = number.shiftX ?? 0;
                if (Math.abs(shift) < Math.abs(previous)) continue;
                number.container.x += shift - previous;
                number.shiftX = shift;
            }
        }
    }
}
