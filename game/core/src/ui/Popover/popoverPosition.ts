export type PopoverPointerPosition = Readonly<{ x: number; y: number }>;

/** Keep the tooltip off the bottom edge while preserving the familiar cursor offset elsewhere. */
export const popoverPositionAtPointer = (
    pointer: PopoverPointerPosition,
    viewportHeight: number,
): PopoverPointerPosition => ({
    x: pointer.x + 10,
    y: pointer.y >= viewportHeight - viewportHeight / 16 ? pointer.y - 70 : pointer.y + 10,
});
