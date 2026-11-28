import React, { useEffect, useState } from "react";
import { TeamVals } from "@heroesofcrypto/common";

import { t, tf, useTranslation } from "../i18n/i18n";
import { usePixiManager } from "../pixi/PixiGameManager";
import type { RosterPlacementHint } from "../scenes/sandbox/rosterPlacementHint";
import { usePointerPopover } from "./Popover/usePointerPopover";

export function SandboxPlacementHint() {
    const manager = usePixiManager();
    const [hint, setHint] = useState<RosterPlacementHint>();
    useTranslation();
    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect((state) => setHint(state.rosterPlacementHint));
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    let message: string | undefined;
    if (hint) {
        const creature = t(hint.creatureName);
        switch (hint.reason) {
            case "stack-limit":
                message = tf("Stack limit reached. Remove a stack to place {creature}.", { creature });
                break;
            case "footprint":
                message = tf("No room for {creature}. Clear a {width}×{height} space in a deployment zone.", {
                    creature,
                    width: hint.width,
                    height: hint.height,
                });
                break;
            case "one-zone":
                message = tf(
                    hint.team === TeamVals.LEFT
                        ? "Only Green has room for {creature}."
                        : "Only Red has room for {creature}.",
                    {
                        creature,
                    },
                );
                break;
        }
    }

    const popover = usePointerPopover(Boolean(message), true);
    return (
        <div
            ref={popover}
            role="status"
            data-sandbox-placement-hint
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                visibility: "hidden",
                zIndex: 7000,
                width: "max-content",
                maxWidth: "min(380px, calc(100% - 28px))",
                pointerEvents: "none",
            }}
        >
            {message && (
                <div
                    style={{
                        padding: "7px 13px",
                        border: "1px solid rgba(219, 157, 89, .65)",
                        borderRadius: 7,
                        background: "rgba(20, 12, 8, .94)",
                        color: "#f2cca1",
                        textAlign: "center",
                        fontSize: 14,
                        lineHeight: 1.35,
                    }}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
