import React, { useEffect, useState } from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { VisibleButtonState, type IVisibleButton, type IVisibleState } from "../../scenes/VisibleState";
import { useButtonContext } from "../context/ButtonContext";
import { useGameLayout } from "./GameViewport";
import { toggleFullscreen } from "../fullscreen";
import { useFullscreenActive } from "../useFullscreenActive";
import { TouchActionBubble } from "./TouchActionBubble";

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
    const [pending, setPending] = useState(manager.GetTouchActionPreview());
    const [inspect, setInspect] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);
    const fullscreen = useFullscreenActive(true);
    const [fullscreenNotice, setFullscreenNotice] = useState(false);
    const [visible, setVisible] = useState<IVisibleState | undefined>(manager.m_scene?.sc_visibleState);

    useEffect(() => {
        const connections = [
            manager.onLoadingChanged.connect(setLoading),
            manager.onHasStarted.connect(setStarted),
            manager.onVisibleStateUpdated.connect(setVisible),
            manager.onTouchActionChanged.connect((label) => {
                setPending(manager.GetTouchActionPreview());
                if (label) {
                    setInspect(false);
                    setToolsOpen(false);
                    setPanel(null);
                }
            }),
            manager.onTouchInspection.connect(() => {
                if (!manager.m_scene?.sc_selectedUnitProperties) return;
                manager.SetTouchInspectMode(false);
                setInspect(false);
                setToolsOpen(false);
                setPanel("unit");
            }),
        ];
        return () => {
            connections.forEach((connection) => connection.disconnect());
            manager.SetTouchInspectMode(false);
        };
    }, [manager, setPanel]);

    useEffect(() => {
        if (!toolsOpen) return;
        const dismiss = (event: PointerEvent) => {
            if (event.target instanceof Element && !event.target.closest(".hoc-touch-nav, #hoc-touch-tools")) {
                setToolsOpen(false);
            }
        };
        document.addEventListener("pointerdown", dismiss, true);
        return () => document.removeEventListener("pointerdown", dismiss, true);
    }, [toolsOpen]);

    if (loading) return null;
    const changeInspect = (enabled: boolean) => {
        setInspect(enabled);
        manager.SetTouchInspectMode(enabled);
    };
    const togglePanel = (next: "unit" | "army") => {
        changeInspect(false);
        setToolsOpen(false);
        setPanel(panel === next ? null : next);
    };
    const seconds = started ? visible?.secondsRemaining : undefined;
    const lap = started ? visible?.lapNumber : undefined;
    const turnName = started ? (visible?.upNext?.[0]?.name ?? t("Battle")) : t("Placement");
    const dockedConfirmation = pending && !pending.anchor ? pending : null;
    const visibleButtons = started ? buttons.filter((button) => button.isVisible) : [];
    const autoButton = visibleButtons.find((button) => button.name === "AI");
    const endTurn = visibleButtons.find((button) => button.name === "Next");
    const canStart = !started && visible?.canBeStarted && manager.GetTouchCreatureChoices().length > 0;
    const canRotate = visibleButtons.some(
        (button) => button.name === "Spellbook" && button.text === "Selected spell: Fire Wall",
    );
    const renderCombatButton = (button: IVisibleButton) => {
        const label = t(buttonLabel(button));
        const image = buttonImage(button);
        return (
            <button
                key={button.name}
                className="hoc-touch-combat-action"
                data-action={button.name}
                disabled={button.isDisabled}
                aria-pressed={button.name === "AI" ? button.state === VisibleButtonState.SECOND : undefined}
                aria-label={label}
                title={t(button.text)}
                onClick={() => {
                    changeInspect(false);
                    propagateClick(button.name, button.state);
                }}
            >
                {image && <img src={image} alt="" draggable={false} />}
                <span>{label}</span>
            </button>
        );
    };

    return (
        <>
            <nav className="hoc-touch-nav" aria-label={t("Battle controls")}>
                <div className="hoc-touch-turn" role="status">
                    <strong>{turnName}</strong>
                    <span>
                        {lap ? `${t("Lap")} ${lap}` : null}
                        {typeof seconds === "number" && seconds > 0 && (
                            <>
                                {lap ? " · " : null}
                                {Math.ceil(seconds)}s
                            </>
                        )}
                    </span>
                </div>
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
                <button
                    aria-pressed={inspect}
                    onClick={() => {
                        changeInspect(!inspect);
                        setPanel(null);
                        setToolsOpen(false);
                    }}
                >
                    {t("Inspect")}
                </button>
                <button aria-label={t("Fit battlefield")} onClick={() => manager.HomeCamera()}>
                    {t("Fit")}
                </button>
                <button
                    aria-controls="hoc-touch-tools"
                    aria-expanded={toolsOpen}
                    onClick={() => {
                        changeInspect(false);
                        setPanel(null);
                        setToolsOpen(!toolsOpen);
                    }}
                >
                    {t("More")}
                </button>
            </nav>
            <div
                id="hoc-touch-tools"
                className="hoc-touch-tools"
                role="group"
                aria-label={t("More")}
                hidden={!toolsOpen}
            >
                <div className="hoc-touch-tool-row">
                    <button
                        className="hoc-touch-zoom"
                        aria-label={t("Zoom out")}
                        onClick={() => manager.ZoomTouchBoard(1 / 1.25)}
                    >
                        −
                    </button>
                    <button
                        className="hoc-touch-zoom"
                        aria-label={t("Zoom in")}
                        onClick={() => manager.ZoomTouchBoard(1.25)}
                    >
                        +
                    </button>
                    <div id="hoc-touch-audio-slot" />
                    <button
                        className="hoc-touch-medallion"
                        aria-label={t(fullscreen ? "Exit fullscreen" : "Fullscreen")}
                        aria-pressed={fullscreen}
                        onClick={() => {
                            void toggleFullscreen({ landscape: true }).then((result) => {
                                const unavailable = result === "unavailable" || result === "denied";
                                setFullscreenNotice(unavailable);
                                if (unavailable) setToolsOpen(false);
                            });
                        }}
                    >
                        <img src={images.ui_control_fullscreen_forged_bronze_v1} alt="" draggable={false} />
                    </button>
                    {autoButton && renderCombatButton(autoButton)}
                </div>
                {!started && <p className="hoc-touch-hint">{t("Tap a stack, then its destination. Pinch to zoom.")}</p>}
            </div>
            {inspect && (
                <p className="hoc-touch-inspect-hint" role="status">
                    {t("Tap a unit to inspect")}
                </p>
            )}
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
            {pending?.anchor && (
                <TouchActionBubble
                    label={pending.label}
                    anchor={pending.anchor}
                    confirm={() => manager.ConfirmTouchAction()}
                    cancel={() => manager.CancelTouchAction()}
                />
            )}
            <div
                className="hoc-touch-actionbar"
                data-combat={started ? "true" : undefined}
                role="toolbar"
                aria-label={t("Turn actions")}
            >
                {/* Keep this portal target mounted while confirming, so ranked ready/search controls
                    return to the same live dock when the player cancels or finishes an action. */}
                <div
                    id="hoc-touch-primary-slot"
                    className="hoc-touch-primary-slot"
                    hidden={started || !!dockedConfirmation}
                />
                {dockedConfirmation ? (
                    <div className="hoc-touch-confirm" role="region" aria-label={t("Confirm battle action")}>
                        <span aria-live="polite">{t(dockedConfirmation.label)}</span>
                        <button onClick={() => manager.CancelTouchAction()}>{t("Cancel")}</button>
                        <button className="hoc-touch-primary" onClick={() => manager.ConfirmTouchAction()}>
                            {t("Confirm")}
                        </button>
                    </div>
                ) : (
                    <>
                        {visibleButtons
                            .filter((button) => button !== autoButton && button !== endTurn)
                            .map(renderCombatButton)}
                        {canStart && (
                            <button className="hoc-touch-primary" onClick={() => manager.StartGame()}>
                                {t("Start battle")}
                            </button>
                        )}
                        {canRotate && (
                            <button
                                className="hoc-touch-icon-action"
                                onClick={() => manager.RotateTouchSpell()}
                                aria-label={t("Rotate spell")}
                            >
                                <b aria-hidden="true">↻</b>
                                <span>{t("Rotate")}</span>
                            </button>
                        )}
                        <button
                            className="hoc-touch-icon-action"
                            onClick={() => {
                                manager.HandleEscapeKey(true);
                                changeInspect(false);
                            }}
                        >
                            <img src={images.ui_control_close_oxblood_bronze_v2} alt="" draggable={false} />
                            <span>{t("Deselect")}</span>
                        </button>
                        {endTurn && renderCombatButton(endTurn)}
                    </>
                )}
            </div>
        </>
    );
}
