import Box from "@mui/joy/Box";
import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

import { images } from "../../generated/image_imports";
import { FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX, FIGHT_LOG_SCROLLBAR_THUMB_WIDTH_PX } from "./fightLogLayout";

const FIGHT_LOG_SCROLLBAR_CAP_INSET_PX = 10;
const FIGHT_LOG_SCROLLBAR_MIN_THUMB_PX = 46;
const FIGHT_LOG_SCROLL_RAIL_EXTENSION_PX = FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX;

interface IScrollbarMetrics {
    visible: boolean;
    thumbTop: number;
    thumbHeight: number;
}

export const ImageScrollbar = ({
    viewportRef,
    top = "34px",
    right = `-${FIGHT_LOG_SCROLL_RAIL_EXTENSION_PX}px`,
    bottom = 0,
    thumbCenterPercent = 55,
    thumbWidthPx = FIGHT_LOG_SCROLLBAR_THUMB_WIDTH_PX,
}: {
    viewportRef: React.RefObject<HTMLDivElement | null>;
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    thumbCenterPercent?: number;
    thumbWidthPx?: number;
}) => {
    const railRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; clientY: number; scrollTop: number } | null>(null);
    const [metrics, setMetrics] = useState<IScrollbarMetrics>({ visible: false, thumbTop: 0, thumbHeight: 0 });

    const updateMetrics = useCallback((): void => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        const railHeight = railRef.current?.clientHeight ?? viewport.clientHeight;
        const usableRailHeight = Math.max(0, railHeight - FIGHT_LOG_SCROLLBAR_CAP_INSET_PX * 2);
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const visible = maxScrollTop > 1 && usableRailHeight > 0;
        const thumbHeight = visible
            ? Math.min(
                  usableRailHeight,
                  Math.max(
                      FIGHT_LOG_SCROLLBAR_MIN_THUMB_PX,
                      Math.round((viewport.clientHeight / viewport.scrollHeight) * usableRailHeight),
                  ),
              )
            : 0;
        const thumbTravel = Math.max(0, usableRailHeight - thumbHeight);
        const thumbTop = visible
            ? FIGHT_LOG_SCROLLBAR_CAP_INSET_PX +
              (maxScrollTop === 0 ? 0 : Math.round((viewport.scrollTop / maxScrollTop) * thumbTravel))
            : 0;

        setMetrics((previous) =>
            previous.visible === visible && previous.thumbTop === thumbTop && previous.thumbHeight === thumbHeight
                ? previous
                : { visible, thumbTop, thumbHeight },
        );
    }, [viewportRef]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        updateMetrics();
        viewport.addEventListener("scroll", updateMetrics, { passive: true });
        const resizeObserver = new ResizeObserver(updateMetrics);
        resizeObserver.observe(viewport);
        for (const child of Array.from(viewport.children)) resizeObserver.observe(child);

        return () => {
            viewport.removeEventListener("scroll", updateMetrics);
            resizeObserver.disconnect();
        };
    }, [updateMetrics, viewportRef]);

    const scrollToThumbTop = (thumbTop: number): void => {
        const viewport = viewportRef.current;
        const rail = railRef.current;
        if (!viewport || !rail) return;
        const thumbTravel = Math.max(0, rail.clientHeight - FIGHT_LOG_SCROLLBAR_CAP_INSET_PX * 2 - metrics.thumbHeight);
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = thumbTravel === 0 ? 0 : (thumbTop / thumbTravel) * maxScrollTop;
    };

    const handleRailPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (event.target !== event.currentTarget || !metrics.visible) return;
        const railRect = event.currentTarget.getBoundingClientRect();
        const thumbTravel = Math.max(0, railRect.height - FIGHT_LOG_SCROLLBAR_CAP_INSET_PX * 2 - metrics.thumbHeight);
        const requestedTop = Math.max(
            0,
            Math.min(
                thumbTravel,
                event.clientY - railRect.top - FIGHT_LOG_SCROLLBAR_CAP_INSET_PX - metrics.thumbHeight / 2,
            ),
        );
        scrollToThumbTop(requestedTop);
    };

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, clientY: event.clientY, scrollTop: viewport.scrollTop };
    };

    const handleThumbPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
        const drag = dragRef.current;
        const viewport = viewportRef.current;
        const rail = railRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !viewport || !rail) return;
        const thumbTravel = Math.max(0, rail.clientHeight - FIGHT_LOG_SCROLLBAR_CAP_INSET_PX * 2 - metrics.thumbHeight);
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop =
            thumbTravel === 0 ? 0 : drag.scrollTop + ((event.clientY - drag.clientY) / thumbTravel) * maxScrollTop;
    };

    const stopThumbDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };

    return (
        <Box
            ref={railRef}
            aria-hidden="true"
            onPointerDown={handleRailPointerDown}
            sx={{
                position: "absolute",
                zIndex: 3,
                top,
                right,
                bottom,
                width: `${FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX}px`,
                opacity: metrics.visible ? 1 : 0,
                pointerEvents: metrics.visible ? "auto" : "none",
                cursor: "var(--hoc-cursor-interactive), pointer",
                touchAction: "none",
                background: "transparent",
            }}
        >
            <Box
                onPointerDown={handleThumbPointerDown}
                onPointerMove={handleThumbPointerMove}
                onPointerUp={stopThumbDrag}
                onPointerCancel={stopThumbDrag}
                sx={{
                    position: "absolute",
                    top: `${metrics.thumbTop}px`,
                    left: `${thumbCenterPercent}%`,
                    width: `${thumbWidthPx}px`,
                    height: `${metrics.thumbHeight}px`,
                    transform: "translateX(-50%)",
                    cursor: "grab",
                    touchAction: "none",
                    backgroundImage: `url(${images.fight_log_scrollbar_thumb_gothic_v1})`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "100% 100%",
                    "&:active": { cursor: "grabbing" },
                }}
            />
        </Box>
    );
};
