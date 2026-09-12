import type { UnitProperties } from "@heroesofcrypto/common";
import React, { useCallback, useEffect, useState } from "react";

import type { CreatureAnimationLabState } from "../pixi/PixiScene";
import { usePixiManager } from "../pixi/PixiGameManager";

const animationButtons: ReadonlyArray<{ state: CreatureAnimationLabState; label: string; hint: string }> = [
    { state: "idle", label: "IDLE", hint: "Сбросить в idle" },
    { state: "attack_up", label: "АТАКА ↑", hint: "Атака вверх" },
    { state: "attack_down", label: "АТАКА ↓", hint: "Атака вниз" },
    { state: "attack", label: "АТАКА →", hint: "Атака по линии" },
    { state: "hit", label: "УРОН", hint: "Получение урона" },
    { state: "death", label: "СМЕРТЬ", hint: "Смерть без удаления" },
];

const directions: ReadonlyArray<{ dx: number; dy: number; label: string; key: string }> = [
    { dx: -1, dy: 1, label: "↖", key: "nw" },
    { dx: 0, dy: 1, label: "↑", key: "n" },
    { dx: 1, dy: 1, label: "↗", key: "ne" },
    { dx: -1, dy: 0, label: "←", key: "w" },
    { dx: 0, dy: 0, label: "•", key: "idle" },
    { dx: 1, dy: 0, label: "→", key: "e" },
    { dx: -1, dy: -1, label: "↙", key: "sw" },
    { dx: 0, dy: -1, label: "↓", key: "s" },
    { dx: 1, dy: -1, label: "↘", key: "se" },
];

const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 1200,
    left: "50%",
    bottom: 18,
    transform: "translateX(-50%)",
    display: "grid",
    gridTemplateColumns: "190px minmax(440px, 1fr)",
    gap: 16,
    width: "min(760px, calc(100vw - 420px))",
    minWidth: 650,
    padding: "15px 17px",
    border: "1px solid rgba(230, 196, 112, 0.7)",
    borderRadius: 14,
    color: "#f5e7bd",
    background: "linear-gradient(180deg, rgba(32, 27, 24, 0.97), rgba(14, 13, 15, 0.97))",
    boxShadow: "0 18px 50px rgba(0,0,0,.58), inset 0 1px 0 rgba(255,255,255,.08)",
    fontFamily: "Open Sans, sans-serif",
    userSelect: "none",
};

const buttonStyle: React.CSSProperties = {
    minHeight: 38,
    padding: "7px 10px",
    border: "1px solid rgba(214, 178, 91, 0.46)",
    borderRadius: 8,
    color: "#fff3cf",
    background: "linear-gradient(180deg, rgba(91, 70, 43, .92), rgba(48, 38, 30, .96))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.25)",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: ".04em",
};

const isTypingTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

export const CreatureAnimationLabPanel: React.FC = () => {
    const manager = usePixiManager();
    const [selected, setSelected] = useState<UnitProperties | null>(null);
    const [status, setStatus] = useState("Поставьте существо, выберите его и кликните по клетке назначения");
    const [ok, setOk] = useState(true);

    const showResult = useCallback((result: { ok: boolean; message: string }) => {
        setOk(result.ok);
        setStatus(result.message);
    }, []);

    const play = useCallback(
        (state: CreatureAnimationLabState) => showResult(manager.PlayCreatureAnimationLabState(state)),
        [manager, showResult],
    );
    const move = useCallback(
        (dx: number, dy: number) => {
            if (!dx && !dy) {
                play("idle");
                return;
            }
            showResult(manager.MoveCreatureAnimationLabSelection(dx, dy));
        },
        [manager, play, showResult],
    );

    useEffect(() => {
        manager.SetCreatureAnimationLabEnabled(true);
        const selectionConnection = manager.onSelectionCombined.connect(({ unit }) => {
            setSelected(unit);
            if (unit) {
                setOk(true);
                setStatus(`${unit.name}: выбран`);
            }
        });
        const loadingConnection = manager.onLoadingChanged.connect((loading) => {
            if (!loading) manager.SetCreatureAnimationLabEnabled(true);
        });
        return () => {
            selectionConnection.disconnect();
            loadingConnection.disconnect();
            manager.SetCreatureAnimationLabEnabled(false);
        };
    }, [manager]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat || isTypingTarget(event.target)) return;
            const deltaByKey: Record<string, [number, number]> = {
                ArrowUp: [0, 1],
                ArrowDown: [0, -1],
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                w: [0, 1],
                s: [0, -1],
                a: [-1, 0],
                d: [1, 0],
            };
            const delta = deltaByKey[event.key];
            if (!delta) return;
            event.preventDefault();
            event.stopPropagation();
            move(delta[0], delta[1]);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [move]);

    return (
        <aside style={panelStyle} aria-label="Creature animation lab">
            <section>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                    <span
                        style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: "#79d980",
                            boxShadow: "0 0 10px #79d980",
                        }}
                    />
                    <strong style={{ fontSize: 12, letterSpacing: ".1em" }}>БЕСКОНЕЧНЫЙ ПОЛИГОН</strong>
                </div>
                <div style={{ color: "#fff5d8", fontSize: 15, fontWeight: 800, marginBottom: 5 }}>
                    {selected?.name ?? "Нет выбранного существа"}
                </div>
                <div style={{ color: "#bdb3a0", fontSize: 11, lineHeight: 1.45 }}>
                    Idle работает постоянно. Клик по свободной клетке запускает быстрый бег без лимита хода.
                </div>
                <div
                    style={{
                        marginTop: 9,
                        color: ok ? "#9ee3a3" : "#ff9a8e",
                        fontSize: 10,
                        lineHeight: 1.35,
                        minHeight: 27,
                    }}
                >
                    {status}
                </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "126px 1fr", gap: 14 }}>
                <div>
                    <div style={{ color: "#a99c84", fontSize: 9, marginBottom: 6, letterSpacing: ".12em" }}>
                        БЕГ · КЛИК / WASD
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 38px)", gap: 4 }}>
                        {directions.map((direction) => (
                            <button
                                type="button"
                                key={direction.key}
                                onClick={() => move(direction.dx, direction.dy)}
                                title={
                                    !direction.dx && !direction.dy
                                        ? "Вернуться в idle"
                                        : "Быстрый шаг на соседнюю клетку"
                                }
                                style={{ ...buttonStyle, minHeight: 34, padding: 0, fontSize: 18 }}
                            >
                                {direction.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ color: "#a99c84", fontSize: 9, marginBottom: 6, letterSpacing: ".12em" }}>
                        ПРИНУДИТЕЛЬНАЯ АНИМАЦИЯ
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(105px, 1fr))", gap: 7 }}>
                        {animationButtons.map(({ state, label, hint }) => (
                            <button
                                type="button"
                                key={state}
                                onClick={() => play(state)}
                                title={hint}
                                style={{
                                    ...buttonStyle,
                                    borderColor:
                                        state === "idle" ? "rgba(111, 209, 126, .65)" : buttonStyle.borderColor,
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div style={{ marginTop: 8, color: "#8f877b", fontSize: 9.5 }}>
                        Карта пустая и бесконечная по времени: без ходов, таймеров, сужения и конца боя.
                    </div>
                </div>
            </section>
        </aside>
    );
};
