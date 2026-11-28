export type PopoverPointerPosition = Readonly<{ x: number; y: number }>;

type Size = Readonly<{ width: number; height: number }>;

/** Leave the pointed tile clear and use the other side of the pointer near a viewport edge. */
export function popoverPositionAtPointer(
    pointer: PopoverPointerPosition,
    size: Size,
    viewport: Size,
): PopoverPointerPosition {
    const gap = 12;
    const margin = 8;
    const coordinate = (point: number, length: number, available: number) => {
        const end = Math.max(margin, available - length - margin);
        const preferred = point + gap <= end ? point + gap : point - gap - length;
        return Math.max(margin, Math.min(end, preferred));
    };
    return {
        x: coordinate(pointer.x, size.width, viewport.width),
        y: coordinate(pointer.y, size.height, viewport.height),
    };
}
