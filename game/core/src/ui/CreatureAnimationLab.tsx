import type { UnitProperties } from "@heroesofcrypto/common";
import React, { useCallback, useEffect, useState } from "react";

import type { CreatureAnimationLabState } from "../pixi/PixiScene";
import { usePixiManager } from "../pixi/PixiGameManager";

const animationButtons: ReadonlyArray<{ state: CreatureAnimationLabState; label: string; hint: string }> = [
    { state: "idle", label: "IDLE", hint: "Сбросить в idle" },
    { state: "attack_up", label: "ДАЛЬНЯЯ ↑", hint: "Бросок в верхнюю цель" },
    { state: "attack_down", label: "ДАЛЬНЯЯ ↓", hint: "Бросок в нижнюю цель" },
    { state: "attack", label: "ДАЛЬНЯЯ →", hint: "Бросок по линии" },
    {
        state: "melee_attack_up",
        label: "БЛИЖНЯЯ ↑",
        hint: "Цель в верхних клетках. Стрелка обозначает положение цели, а не направление замаха",
    },
    { state: "melee_attack", label: "БЛИЖНЯЯ →", hint: "Ближняя атака по линии" },
    {
        state: "melee_attack_down",
        label: "БЛИЖНЯЯ ↓",
        hint: "Цель в нижних клетках. Стрелка обозначает положение цели, а не направление замаха",
    },
    { state: "cast", label: "КАСТ", hint: "Применение заклинания" },
    { state: "hit", label: "УРОН", hint: "Получение урона" },
    { state: "death", label: "СМЕРТЬ", hint: "Смерть без удаления" },
];

const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 1200,
    left: "50%",
    bottom: 18,
    transform: "translateX(-50%)",
    display: "grid",
    gridTemplateColumns: "minmax(150px, 1fr) minmax(260px, 1.4fr)",
    gap: 16,
    width: "min(660px, calc(100vw - 64px))",
    boxSizing: "border-box",
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
    const [status, setStatus] = useState("Выберите портрет и поставьте существо кликом на карту");
    const [ok, setOk] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

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

    if (collapsed) {
        return (
            <button
                type="button"
                onClick={() => setCollapsed(false)}
                style={{ ...buttonStyle, position: "fixed", top: 16, right: 64, zIndex: 1200 }}
            >
                Анимации
            </button>
        );
    }

    return (
        <aside style={panelStyle} aria-label="Creature animation lab">
            <button
                type="button"
                aria-label="Свернуть панель анимаций"
                title="Свернуть и открыть всю карту"
                onClick={() => setCollapsed(true)}
                style={{ ...buttonStyle, position: "absolute", top: -34, right: 0, minHeight: 28, padding: "3px 10px" }}
            >
                Свернуть
            </button>
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
                    Кликните по карте — существо пойдёт туда. Новый клик сразу меняет цель, даже во время движения.
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

            <section>
                <div>
                    <div style={{ color: "#a99c84", fontSize: 9, marginBottom: 6, letterSpacing: ".12em" }}>
                        ПРИНУДИТЕЛЬНАЯ АНИМАЦИЯ
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
                        {animationButtons
                            .filter(
                                ({ state }) =>
                                    (!["Blacksmith", "Wolf"].includes(selected?.name ?? "") ||
                                        !["attack", "attack_up", "attack_down"].includes(state)) &&
                                    (!["Squire", "Troglodyte", "Healer"].includes(selected?.name ?? "") ||
                                        !state.startsWith("melee_attack")),
                            )
                            .map(({ state, label, hint }) => (
                                <button
                                    type="button"
                                    key={state}
                                    onClick={() => play(state)}
                                    title={
                                        selected?.name === "Squire" && state.startsWith("attack")
                                            ? hint.replace("Бросок", "Удар булавой")
                                            : selected?.name === "Troglodyte" && state.startsWith("attack")
                                              ? hint.replace("Бросок", "Удар киркой")
                                              : selected?.name === "Healer" && state.startsWith("attack")
                                                ? hint.replace("Бросок", "Магическая атака")
                                                : hint
                                    }
                                    style={{
                                        ...buttonStyle,
                                        borderColor:
                                            state === "idle" ? "rgba(111, 209, 126, .65)" : buttonStyle.borderColor,
                                    }}
                                >
                                    {selected?.name === "Squire"
                                        ? label.replace("ДАЛЬНЯЯ", "БЛИЖНЯЯ")
                                        : ["Troglodyte", "Healer"].includes(selected?.name ?? "")
                                          ? label.replace("ДАЛЬНЯЯ", "АТАКА")
                                          : label}
                                </button>
                            ))}
                    </div>
                    <div style={{ marginTop: 8, color: "#8f877b", fontSize: 9.5 }}>
                        Движение мышью · WASD — шаг. Сверху ставятся красные, снизу — зелёные.
                    </div>
                </div>
            </section>
        </aside>
    );
};
