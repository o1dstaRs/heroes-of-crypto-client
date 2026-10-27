import React, { useEffect, useState } from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { VisibleButtonState, type IVisibleButton, type IVisibleState } from "../../scenes/VisibleState";
import { useButtonContext } from "../context/ButtonContext";
import { useGameLayout } from "./GameViewport";
import { toggleFullscreen } from "../fullscreen";
import { useFullscreenActive } from "../useFullscreenActive";

const buttonLabel = (button: IVisibleButton): string => {
    switch (button.name) {
        case "Hourglass":
        case "TimeDenial":
            return "Wait";
        case "LuckShield":
            return "Luck Shield";
        case "Next":
            return "End turn";
        case "Spellbook":
            return button.customSpriteName ? button.text.replace(/^Selected spell: /, "") : "Spells";
        case "AI":
            return button.state === VisibleButtonState.SECOND ? "Auto: on" : "Auto: off";
        case "AttackType":
            return button.state === VisibleButtonState.SECOND
                ? "Ranged"
                : button.state === VisibleButtonState.THIRD
                  ? "Magic"
                  : "Melee";
        default:
            return button.name;
    }
};

const buttonImage = (button: IVisibleButton): string | undefined => {
    if (button.customSpriteName) return images[button.customSpriteName as keyof typeof images];
    switch (button.name) {
        case "Hourglass":
        case "TimeDenial":
            return images.combat_toolbar_ember_hourglass;
        case "LuckShield":
            return images.combat_toolbar_ember_luck;
        case "Next":
            return images.combat_toolbar_ember_next;
        case "Spellbook":
            return images.combat_toolbar_ember_spellbook;
        case "AI":
            return images.combat_toolbar_ember_ai;
        case "AttackType":
            return button.state === VisibleButtonState.SECOND
                ? images.combat_toolbar_ember_bow
                : button.state === VisibleButtonState.THIRD
                  ? images.combat_toolbar_ember_scepter
                  : images.combat_toolbar_ember_sword;
        default:
            return undefined;
    }
};

export default function TouchBattleHud() {
    const manager = usePixiManager();
    const { panel, setPanel } = useGameLayout();
    const { buttons, propagateClick } = useButtonContext();
    const [loading, setLoading] = useState(manager.isLoading);
    const [started, setStarted] = useState(manager.hasStarted);
    const [pending, setPending] = useState(manager.GetTouchActionLabel());
    const [inspect, setInspect] = useState(false);
    const fullscreen = useFullscreenActive(true);
    const [fullscreenNotice, setFullscreenNotice] = useState(false);
    const [visible, setVisible] = useState<IVisibleState | undefined>(manager.m_scene?.sc_visibleState);

    useEffect(() => {
        const connections = [
            manager.onLoadingChanged.connect(setLoading),
            manager.onHasStarted.connect(setStarted),
            manager.onVisibleStateUpdated.connect(setVisible),
            manager.onTouchActionChanged.connect((label) => {
                setPending(label);
                if (label) {
                    setInspect(false);
                    setPanel(null);
                }
            }),
            manager.onTouchInspection.connect(() => setPanel("unit")),
        ];
        return () => {
            connections.forEach((connection) => connection.disconnect());
            manager.SetTouchInspectMode(false);
        };
    }, [manager, setPanel]);

    if (loading) return null;
    const togglePanel = (next: "unit" | "army") => {
        setInspect(false);
        manager.SetTouchInspectMode(false);
        setPanel(panel === next ? null : next);
    };
    const seconds = visible?.secondsRemaining;
    const active = visible?.upNext?.[0]?.name;

    return (
        <>
            <nav className="hoc-touch-topbar" aria-label={t("Battle controls")}>
                <button aria-expanded={panel === "unit"} onClick={() => togglePanel("unit")}>
                    {t("Unit")}
                </button>
                <button
                    aria-label={t("Army & log")}
                    aria-expanded={panel === "army"}
                    onClick={() => togglePanel("army")}
                >
                    {t("Army")}
                </button>
                <div className="hoc-touch-turn" role="status">
                    <strong>{active ?? t("Placement")}</strong>
                    <span>
                        {visible?.lapNumber ? `${t("Lap")} ${visible.lapNumber}` : t("Prepare your army")}
                        {typeof seconds === "number" && seconds > 0 ? ` · ${Math.ceil(seconds)}s` : ""}
                    </span>
                </div>
                <button
                    aria-pressed={inspect}
                    onClick={() => {
                        const next = !inspect;
                        setInspect(next);
                        manager.SetTouchInspectMode(next);
                        if (next) setPanel("unit");
                    }}
                >
                    {t("Inspect")}
                </button>
                <button aria-label={t("Zoom out")} onClick={() => manager.ZoomTouchBoard(1 / 1.25)}>
                    −
                </button>
                <button aria-label={t("Fit battlefield")} onClick={() => manager.HomeCamera()}>
                    {t("Fit")}
                </button>
                <button aria-label={t("Zoom in")} onClick={() => manager.ZoomTouchBoard(1.25)}>
                    +
                </button>
                <div id="hoc-touch-audio-slot" />
                <button
                    className="hoc-touch-medallion"
                    aria-label={t(fullscreen ? "Exit fullscreen" : "Fullscreen")}
                    aria-pressed={fullscreen}
                    onClick={() => {
                        void toggleFullscreen({ landscape: true }).then((result) =>
                            setFullscreenNotice(result === "unavailable" || result === "denied"),
                        );
                    }}
                >
                    <img src={images.ui_control_fullscreen_forged_bronze_v1} alt="" draggable={false} />
                </button>
            </nav>
            {fullscreenNotice && (
                <div className="hoc-touch-notice" role="status">
                    <span>{t("Fullscreen is unavailable here. Use Add to Home Screen for an app view.")}</span>
                    <button
                        className="hoc-touch-medallion"
                        aria-label={t("Close")}
                        onClick={() => setFullscreenNotice(false)}
                    >
                        <img src={images.ui_control_close_oxblood_bronze_v2} alt="" draggable={false} />
                    </button>
                </div>
            )}
            <div className="hoc-touch-actionbar" role="toolbar" aria-label={t("Turn actions")}>
                {/* Keep this portal target mounted while confirming, so ranked ready/search controls
                    return to the same live dock when the player cancels or finishes an action. */}
                <div id="hoc-touch-primary-slot" className="hoc-touch-primary-slot" hidden={started || !!pending} />
                {pending ? (
                    <div className="hoc-touch-confirm" role="region" aria-label={t("Confirm battle action")}>
                        <span aria-live="polite">{t(pending)}</span>
                        <button onClick={() => manager.CancelTouchAction()}>{t("Cancel")}</button>
                        <button className="hoc-touch-primary" onClick={() => manager.ConfirmTouchAction()}>
                            {t("Confirm")}
                        </button>
                    </div>
                ) : (
                    <>
                        {started && buttons.some((button) => button.isVisible) ? (
                            buttons
                                .filter((button) => button.isVisible)
                                .map((button) => (
                                    <button
                                        key={button.name}
                                        className="hoc-touch-combat-action"
                                        disabled={button.isDisabled}
                                        aria-pressed={
                                            button.name === "AI"
                                                ? button.state === VisibleButtonState.SECOND
                                                : undefined
                                        }
                                        aria-label={t(buttonLabel(button))}
                                        title={t(button.text)}
                                        onClick={() => {
                                            setInspect(false);
                                            manager.SetTouchInspectMode(false);
                                            propagateClick(button.name, button.state);
                                        }}
                                    >
                                        {buttonImage(button) && (
                                            <img src={buttonImage(button)} alt="" draggable={false} />
                                        )}
                                        <span>{t(buttonLabel(button))}</span>
                                    </button>
                                ))
                        ) : (
                            <>
                                <button className="hoc-touch-primary" onClick={() => togglePanel("army")}>
                                    {t("Army & placement")}
                                </button>
                                {visible?.canBeStarted && manager.GetTouchCreatureChoices().length > 0 && (
                                    <button className="hoc-touch-primary" onClick={() => manager.StartGame()}>
                                        {t("Start battle")}
                                    </button>
                                )}
                                <span className="hoc-touch-hint">
                                    {t("Tap a stack, then its destination. Pinch to zoom.")}
                                </span>
                            </>
                        )}
                        {buttons.some(
                            (button) => button.name === "Spellbook" && button.text === "Selected spell: Fire Wall",
                        ) && (
                            <button
                                onClick={() => {
                                    manager.RotateTouchSpell();
                                }}
                                aria-label={t("Rotate spell")}
                            >
                                ↻<span>{t("Rotate")}</span>
                            </button>
                        )}
                        <button
                            className="hoc-touch-icon-action"
                            onClick={() => {
                                manager.CancelTouchAction();
                                manager.HandleEscapeKey(true);
                                setInspect(false);
                                manager.SetTouchInspectMode(false);
                            }}
                        >
                            <img src={images.ui_control_close_oxblood_bronze_v2} alt="" draggable={false} />
                            <span>{t("Deselect")}</span>
                        </button>
                    </>
                )}
            </div>
        </>
    );
}
