import { useLayoutEffect, useRef } from "react";

export const ACTIVE_TURN_QUEUE_PULSE_DURATION_MS = 1250;
export const ACTIVE_TURN_QUEUE_PULSE_MIN_SCALE = 0.96;
export const ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE = 1.075;

const ACTIVE_TURN_QUEUE_PULSE_KEYFRAMES: Keyframe[] = [
    {
        transform: `scale(${ACTIVE_TURN_QUEUE_PULSE_MIN_SCALE})`,
        opacity: 0.94,
        boxShadow: "inset 0 0 9px rgba(225, 173, 74, 0.22), 0 0 6px rgba(225, 173, 74, 0.34)",
    },
    {
        transform: `scale(${ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE})`,
        opacity: 1,
        boxShadow: "inset 0 0 14px rgba(225, 173, 74, 0.38), 0 0 14px rgba(225, 173, 74, 0.62)",
        offset: 0.5,
    },
    {
        transform: `scale(${ACTIVE_TURN_QUEUE_PULSE_MIN_SCALE})`,
        opacity: 0.94,
        boxShadow: "inset 0 0 9px rgba(225, 173, 74, 0.22), 0 0 6px rgba(225, 173, 74, 0.34)",
    },
];

let synchronizedActiveUnitId: string | undefined;
let synchronizedPulseStartTime: CSSNumberish = 0;

const pulseStartTimeFor = (activeUnitId: string): CSSNumberish => {
    if (synchronizedActiveUnitId !== activeUnitId) {
        synchronizedActiveUnitId = activeUnitId;
        synchronizedPulseStartTime = document.timeline.currentTime ?? 0;
    }
    return synchronizedPulseStartTime;
};

/**
 * Animates the one active queue card on the document timeline. Both surfaces reuse the start time captured
 * for that unit, so a newly opened Option overlay joins the sidebar's smooth pulse without restarting it.
 */
export const useSynchronizedActiveTurnQueuePulse = (activeUnitId?: string, enabled = true) => {
    const elementRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const element = elementRef.current;
        if (!element || !activeUnitId || !enabled) return;

        const animation = element.animate(ACTIVE_TURN_QUEUE_PULSE_KEYFRAMES, {
            duration: ACTIVE_TURN_QUEUE_PULSE_DURATION_MS,
            easing: "ease-in-out",
            iterations: Infinity,
        });
        animation.startTime = pulseStartTimeFor(activeUnitId);

        return () => animation.cancel();
    }, [activeUnitId, enabled]);

    return elementRef;
};
