import React, { useLayoutEffect, useRef, useState } from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import type { TouchPoint } from "../../pixi/TouchBoardInput";
import { getTouchGameInsets } from "../../viewport/gameViewport";
import { useGameLayout } from "./GameViewport";
import { touchConfirmationLayout } from "./touchConfirmationLayout";

export function TouchActionBubble({
    label,
    anchor,
    confirm,
    cancel,
}: {
    label: string;
    anchor: TouchPoint;
    confirm: () => void;
    cancel: () => void;
}) {
    const viewport = useGameLayout();
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 220, height: 86 });
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const measure = () => {
            const width = element.offsetWidth;
            const height = element.offsetHeight;
            setSize((previous) =>
                previous.width === width && previous.height === height ? previous : { width, height },
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const position = touchConfirmationLayout(anchor, size, viewport, getTouchGameInsets());
    return (
        <div
            ref={ref}
            className="hoc-touch-confirm-bubble"
            role="region"
            aria-label={t("Confirm battle action")}
            data-placement={position.placement}
            style={
                {
                    left: position.left,
                    top: position.top,
                    "--hoc-touch-confirm-arrow": `${position.arrow}px`,
                } as React.CSSProperties
            }
            onPointerDown={(event) => event.stopPropagation()}
        >
            <span className="hoc-touch-confirm-caption" aria-live="polite">
                {t(label)}
            </span>
            <div className="hoc-touch-confirm-buttons">
                <button aria-label={t("Cancel")} className="hoc-touch-confirm-cancel" onClick={cancel}>
                    <img src={images.ui_control_close_oxblood_bronze_v2} alt="" draggable={false} />
                </button>
                <button className="hoc-touch-primary" onClick={confirm}>
                    <span aria-hidden="true">✓</span> {t("Confirm")}
                </button>
            </div>
        </div>
    );
}
