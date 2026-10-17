import {
    ANIMATION_PROFILE_EVENT,
    hasLocalAnimationProfile,
    saveAnimationSetting,
} from "../settings/animationLabProfile";
import { readCyclopsImpactMode, type CyclopsImpactMode } from "../scenes/sandbox/CyclopsFracturePhysics";
import { readFireSpellRenderMode, type FireSpellRenderMode } from "../settings/fireSpellTiming";
import type { UnitProperties } from "@heroesofcrypto/common";
import React, { useCallback, useEffect, useState } from "react";
import "./CreatureAnimationLab.scss";

import type { CreatureAnimationLabState, CreatureAnimationLabSpell } from "../pixi/PixiScene";
import { usePixiManager } from "../pixi/PixiGameManager";
import {
    canPreviewCreatureLabState,
    creatureLabHasSpell,
    creatureLabSpellOptions,
} from "./creatureAnimationLabCapabilities";
import {
    mantisLabFlightSettings,
    setMantisLabFlightSetting,
    MANTIS_LAB_FLIGHT_DEFAULTS,
    type MantisLabFlightSettings,
} from "../scenes/MantisLabFlight";
import {
    griffinLabFlightSettings,
    setGriffinLabFlightSetting,
    GRIFFIN_LAB_FLIGHT_DEFAULTS,
    type GriffinLabFlightSettings,
} from "../scenes/GriffinLabFlight";

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

const effectButtons: ReadonlyArray<{ state: CreatureAnimationLabState; label: string; hint: string }> = [
    {
        state: "battle_roar_short",
        label: "РЁВ 1 С",
        hint: "РЁВ 1 С",
    },
    {
        state: "battle_roar_long",
        label: "РЁВ 1,5 С",
        hint: "РЁВ 1,5 С",
    },
    {
        state: "ai_brain",
        label: "МОЗГ ИИ ↻",
        hint: "Включить или выключить зацикленный мозг ИИ над флагом выбранного существа",
    },
    {
        state: "paralysis",
        label: "ПАРАЛИЧ",
        hint: "Наложить паралич: анимация 1 с, иконка держится до снятия. Повторное нажатие снимает эффект",
    },
    {
        state: "boar_saliva",
        label: "СЛЮНА 1 С",
        hint: "Превью капающей слюны над флагом самого быка · 1 с",
    },
    {
        state: "infest_hatch",
        label: "ЯЙЦО → ПАУК",
        hint: "Превью: смерть соседнего существа, яйцо и вылупление маленького паука",
    },
    {
        state: "infest_hatch_queen",
        label: "ЯЙЦО → КОРОЛЕВА",
        hint: "Превью: смерть существа 4 уровня, большое яйцо и вылупление Арахны Квин",
    },
    {
        state: "predatory_assimilation",
        label: "КРАЖА СКИЛА",
        hint: "Превью: клешня забирает способность соседнего существа и показывает её над флагом паука",
    },
    {
        state: "angel_resurrection",
        label: "ВОСКРЕШЕНИЕ",
        hint: "ВОСКРЕШЕНИЕ",
    },
    {
        state: "devour_essence",
        label: "ПОГЛОЩЕНИЕ 1 С",
        hint: "ПОГЛОЩЕНИЕ 1 С",
    },
    {
        state: "crusade",
        label: "КРЕСТОВЫЙ ПОХОД 1 С",
        hint: "Крестовый поход над флагом чемпиона · 1 с",
    },
    {
        state: "unyielding_power",
        label: "ЭВОЛЮЦИЯ 1 С",
        hint: "ЭВОЛЮЦИЯ 1 С",
    },
    {
        state: "enchanted_skin",
        label: "МАГИЧЕСКИЙ ЩИТ 1 С",
        hint: "Enchanted Skin над флагом · 1 с",
    },
    {
        state: "made_of_fire",
        label: "СОЗДАН ИЗ ОГНЯ 1 С",
        hint: "Made of Fire над флагом · 1 с",
    },
    {
        state: "unicorn_retaliation",
        label: "ОДИН В ПОЛЕ · 1 С",
        hint: "Три меча и рог над флагом при ответной атаке · 1 с",
    },
    {
        state: "unicorn_blindness",
        label: "ОСЛЕПЛЕНИЕ · 1 С",
        hint: "Слепой глаз с отражением рога над флагом · 1 с",
    },
    {
        state: "magic_reflection",
        label: "ОТРАЖЕНИЕ 1 С",
        hint: "ОТРАЖЕНИЕ 1 С",
    },
    {
        state: "deep_wounds_1",
        label: "1 НАДРЕЗ",
        hint: "1 НАДРЕЗ",
    },
    {
        state: "deep_wounds_2",
        label: "2 НАДРЕЗА",
        hint: "2 НАДРЕЗА",
    },
    {
        state: "deep_wounds_3",
        label: "3 НАДРЕЗА",
        hint: "3 НАДРЕЗА",
    },
    {
        state: "dulling_defense",
        label: "DULLING DEFENSE · 1 С",
        hint: "DULLING DEFENSE · 1 С",
    },
    {
        state: "borrowed_grace",
        label: "BORROWED GRACE · 2 С",
        hint: "Рука над противником → украденное усиление над монахом",
    },
    {
        state: "absolving_arrow",
        label: "ABSOLVING ARROW · 1 С",
        hint: "Золотое перо над флагом очищенного союзника · 1 с",
    },
    {
        state: "empower",
        label: "EMPOWER · 1 С",
        hint: "EMPOWER · 1 С",
    },
    {
        state: "ogre_riot",
        label: "RIOT · 1 С",
        hint: "RIOT · 1 С",
    },
    {
        state: "ogre_magic_mirror",
        label: "MAGIC MIRROR · 1 С",
        hint: "MAGIC MIRROR · 1 С",
    },
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
    const [profileStatus, setProfileStatus] = useState(hasLocalAnimationProfile() ? "Настройки · локальный файл" : "");
    useEffect(() => {
        const changed = (event: Event) => {
            const state = (event as CustomEvent<string>).detail;
            setProfileStatus(
                state === "error"
                    ? "Не удалось сохранить настройки на диск"
                    : state === "saving"
                      ? "Сохраняю настройки…"
                      : "Настройки сохранены локально",
            );
        };
        window.addEventListener(ANIMATION_PROFILE_EVENT, changed);
        return () => window.removeEventListener(ANIMATION_PROFILE_EVENT, changed);
    }, []);
    const [selected, setSelected] = useState<UnitProperties | null>(null);
    const [status, setStatus] = useState("Выберите портрет и поставьте существо кликом на карту");
    const [ok, setOk] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const [magicOpen, setMagicOpen] = useState(false);
    const [cyclopsImpactMode, setCyclopsImpactMode] = useState<CyclopsImpactMode>(readCyclopsImpactMode);
    const [fireMode, setFireMode] = useState<FireSpellRenderMode>(readFireSpellRenderMode);
    const [spell, setSpell] = useState<CreatureAnimationLabSpell>("Lightning Strike");
    const availableSpells = creatureLabSpellOptions.filter(({ name }) => creatureLabHasSpell(selected, name));
    const activeSpell = availableSpells.find(({ name }) => name === spell)?.name ?? availableSpells[0]?.name;
    const [mantisSettings, setMantisSettings] = useState({ ...mantisLabFlightSettings });

    const updateMantisSetting = (key: keyof MantisLabFlightSettings, value: number) => {
        setMantisLabFlightSetting(key, value);
        setMantisSettings({ ...mantisLabFlightSettings });
    };

    const [griffinSettings, setGriffinSettings] = useState({ ...griffinLabFlightSettings });

    const updateGriffinSetting = (key: keyof GriffinLabFlightSettings, value: number) => {
        setGriffinLabFlightSetting(key, value);
        setGriffinSettings({ ...griffinLabFlightSettings });
    };

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
            if (magicOpen || event.repeat || isTypingTarget(event.target)) return;
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
    }, [move, magicOpen]);

    useEffect(() => {
        const apply = () => {
            manager.SetCreatureAnimationLabSpell(magicOpen ? activeSpell : undefined);
            manager.SetCreatureAnimationLabFireMode(fireMode);
        };
        apply();
        const connection = manager.onLoadingChanged.connect((loading) => {
            if (!loading) apply();
        });
        return () => {
            connection.disconnect();
            manager.SetCreatureAnimationLabSpell(undefined);
        };
    }, [manager, magicOpen, activeSpell, fireMode]);

    useEffect(() => {
        if (!activeSpell) setMagicOpen(false);
    }, [activeSpell]);

    useEffect(() => {
        const apply = () => manager.SetCreatureAnimationLabCyclopsImpactMode(cyclopsImpactMode);
        apply();
        const connection = manager.onLoadingChanged.connect((loading) => {
            if (!loading) apply();
        });
        return () => {
            connection.disconnect();
            manager.SetCreatureAnimationLabCyclopsImpactMode(readCyclopsImpactMode());
        };
    }, [manager, cyclopsImpactMode]);

    return (
        <>
            <div style={{ position: "fixed", top: 16, right: 64, zIndex: 1200, display: "flex", gap: 8 }}>
                {collapsed && (
                    <button
                        type="button"
                        onClick={() => {
                            setCollapsed(false);
                            setMagicOpen(false);
                        }}
                        style={buttonStyle}
                    >
                        Анимации
                    </button>
                )}
                {activeSpell && (
                    <button
                        type="button"
                        style={buttonStyle}
                        aria-expanded={magicOpen}
                        aria-controls="animation-lab-magic"
                        onClick={() => {
                            setMagicOpen(!magicOpen);
                            if (!magicOpen) {
                                setCollapsed(true);
                                showResult({ ok: true, message: "Выберите заклинание и нажмите «Кастовать»" });
                            }
                        }}
                    >
                        ✦ Магия
                    </button>
                )}
            </div>
            {magicOpen && activeSpell && (
                <aside
                    id="animation-lab-magic"
                    aria-label="Магия"
                    style={{
                        ...panelStyle,
                        left: "auto",
                        bottom: "auto",
                        top: 64,
                        right: 64,
                        transform: "none",
                        width: "min(310px, calc(100vw - 80px))",
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 12,
                    }}
                >
                    <strong style={{ fontSize: 13 }}>МАГИЯ · ПРЕВЬЮ</strong>
                    <label style={{ display: "grid", gap: 6, fontSize: 11 }}>
                        Заклинание
                        <select
                            aria-label="Заклинание"
                            value={activeSpell}
                            onChange={(event) => setSpell(event.target.value as CreatureAnimationLabSpell)}
                            style={{ ...buttonStyle, width: "100%", background: "#30271f" }}
                        >
                            {availableSpells.map(({ name, label }) => (
                                <option key={name} value={name}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {(activeSpell === "Ring of Fire" || activeSpell === "Meteor Shower") && (
                        <label style={{ display: "grid", gap: 6, fontSize: 11 }}>
                            Визуальный эффект
                            <select
                                aria-label="Визуальный эффект"
                                value={fireMode}
                                onChange={(event) => {
                                    const mode = event.target.value as FireSpellRenderMode;
                                    setFireMode(mode);
                                    saveAnimationSetting("fire.renderMode", mode);
                                }}
                                style={{ ...buttonStyle, width: "100%", background: "#30271f" }}
                            >
                                <option value="sprites">Спрайты</option>
                                <option value="particles">Частицы</option>
                            </select>
                            <span style={{ color: "#bdb3a0" }}>Применяется и в обычной игре</span>
                        </label>
                    )}
                    <button
                        type="button"
                        style={buttonStyle}
                        onClick={() => showResult(manager.CastCreatureAnimationLabSpell())}
                    >
                        Кастовать
                    </button>
                    <div style={{ color: "#bdb3a0", fontSize: 11, lineHeight: 1.5 }}>
                        Клик по клетке — каст в неё. Кнопка повторяет каст в последнюю клетку; сначала — в центр поля.
                        Чтобы снова двигать и ставить существ, закройте «Магия».
                    </div>
                    {activeSpell === "Fire Wall" && (
                        <div style={{ fontSize: 11, color: "#e6c28b" }}>
                            Три клетки · горит 6 с. Shift + клик — вертикальная стена.
                        </div>
                    )}
                    <div role="status" style={{ color: ok ? "#9ee3a3" : "#ff9a8e", fontSize: 11 }}>
                        {status}
                    </div>
                </aside>
            )}
            {!collapsed && (
                <aside className="creature-animation-lab-dock" aria-label="Creature animation lab">
                    <button
                        type="button"
                        aria-label="Свернуть панель анимаций"
                        title="Свернуть и открыть всю карту"
                        onClick={() => setCollapsed(true)}
                        style={{
                            ...buttonStyle,
                            position: "absolute",
                            top: -34,
                            right: 0,
                            minHeight: 28,
                            padding: "3px 10px",
                        }}
                    >
                        Свернуть
                    </button>
                    <section className="creature-animation-lab-info">
                        <div
                            className="creature-animation-lab-title"
                            style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}
                        >
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
                        <div
                            className="creature-animation-lab-description"
                            style={{ color: "#bdb3a0", fontSize: 11, lineHeight: 1.45 }}
                        >
                            Кликните по карте — существо пойдёт туда. Новый клик сразу меняет цель, даже во время
                            движения.
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
                        {profileStatus && (
                            <span role="status" style={{ fontSize: 10 }}>
                                {profileStatus}
                            </span>
                        )}
                        {selected?.name === "Cyclops" && (
                            <label style={{ display: "grid", gap: 5, marginTop: 8, fontSize: 11 }}>
                                Разбитие камня · 3×3 клетки
                                <select
                                    aria-label="Циклоп: эффект разбития камня"
                                    value={cyclopsImpactMode}
                                    onChange={(event) => {
                                        const mode = event.target.value as CyclopsImpactMode;
                                        setCyclopsImpactMode(mode);
                                        saveAnimationSetting("cyclops.impactMode", mode);
                                    }}
                                    style={{ ...buttonStyle, width: "100%", background: "#30271f" }}
                                >
                                    <option value="sprites">1 · Спрайты</option>
                                    <option value="engine">2 · Движок · объёмные осколки</option>
                                </select>
                            </label>
                        )}
                        {selected?.name === "Mantis" && (
                            <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                                {(
                                    [
                                        ["takeoffSpeed", "Взлёт"],
                                        ["travelSpeed", "Скорость полёта"],
                                        ["landingSpeed", "Посадка"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <label key={key} style={{ display: "grid", gap: 3, fontSize: 11 }}>
                                        <span>
                                            {label}: {mantisSettings[key].toFixed(2)}×
                                        </span>
                                        <input
                                            aria-label={`Богомол: ${label}`}
                                            type="range"
                                            min={0.25}
                                            max={3}
                                            step={0.05}
                                            value={mantisSettings[key]}
                                            onChange={(event) => updateMantisSetting(key, Number(event.target.value))}
                                        />
                                    </label>
                                ))}
                                <button
                                    type="button"
                                    style={{ ...buttonStyle, minHeight: 26, padding: "3px 8px" }}
                                    onClick={() => {
                                        for (const key of Object.keys(
                                            MANTIS_LAB_FLIGHT_DEFAULTS,
                                        ) as (keyof MantisLabFlightSettings)[])
                                            setMantisLabFlightSetting(key, MANTIS_LAB_FLIGHT_DEFAULTS[key]);
                                        setMantisSettings({ ...mantisLabFlightSettings });
                                    }}
                                >
                                    Сбросить скорости
                                </button>
                                <span style={{ color: "#bdb3a0", fontSize: 10 }}>
                                    16 кадров · цикл 1,3 клетки. Скорость полёта применяется со следующего маршрута.
                                </span>
                                <span style={{ color: "#bdb3a0", fontSize: 10 }}>
                                    Idle: покачивание клешней · раскрытие крыльев каждые 3,8 с · красное мерцание глаз.
                                </span>
                            </div>
                        )}
                        {selected?.name === "Griffin" && (
                            <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
                                {(
                                    [
                                        ["takeoffSpeed", "Взлёт"],
                                        ["travelSpeed", "Скорость полёта"],
                                        ["landingSpeed", "Посадка"],
                                    ] as const
                                ).map(([key, label]) => (
                                    <label key={key} style={{ display: "grid", gap: 3, fontSize: 11 }}>
                                        <span>
                                            {label}: {griffinSettings[key].toFixed(2)}×
                                        </span>
                                        <input
                                            aria-label={`Грифон: ${label}`}
                                            type="range"
                                            min={0.25}
                                            max={3}
                                            step={0.05}
                                            value={griffinSettings[key]}
                                            onChange={(event) => updateGriffinSetting(key, Number(event.target.value))}
                                        />
                                    </label>
                                ))}
                                <button
                                    type="button"
                                    style={{ ...buttonStyle, minHeight: 26, padding: "3px 8px" }}
                                    onClick={() => {
                                        for (const key of Object.keys(
                                            GRIFFIN_LAB_FLIGHT_DEFAULTS,
                                        ) as (keyof GriffinLabFlightSettings)[])
                                            setGriffinLabFlightSetting(key, GRIFFIN_LAB_FLIGHT_DEFAULTS[key]);
                                        setGriffinSettings({ ...griffinLabFlightSettings });
                                    }}
                                >
                                    Сбросить скорости
                                </button>
                                <span style={{ color: "#bdb3a0", fontSize: 10 }}>
                                    16 кадров · цикл 1,3 клетки. Скорость полёта применяется со следующего маршрута.
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="creature-animation-lab-actions">
                        <div>
                            <div style={{ color: "#a99c84", fontSize: 9, marginBottom: 6, letterSpacing: ".12em" }}>
                                ПРИНУДИТЕЛЬНАЯ АНИМАЦИЯ
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }}>
                                {animationButtons
                                    .filter(
                                        ({ state }) =>
                                            canPreviewCreatureLabState(selected, state) &&
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
                                                selected?.name === "Behemoth" && state === "cast"
                                                    ? "Каст чудища и спрайтовый рёв над его флагом · 1 с"
                                                    : selected?.name === "Squire" && state.startsWith("attack")
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
                                                    state === "idle"
                                                        ? "rgba(111, 209, 126, .65)"
                                                        : buttonStyle.borderColor,
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
                        </div>
                    </section>
                    <section className="creature-animation-lab-effects" aria-label="Эффекты и способности">
                        <div>
                            <div style={{ color: "#a99c84", fontSize: 9, marginBottom: 6, letterSpacing: ".12em" }}>
                                ЭФФЕКТЫ И СПОСОБНОСТИ
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                                {effectButtons
                                    .filter(({ state }) => canPreviewCreatureLabState(selected, state))
                                    .map(({ state, label, hint }) => (
                                        <button
                                            key={state}
                                            type="button"
                                            style={buttonStyle}
                                            title={hint}
                                            onClick={() => play(state)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                            </div>
                            {selected?.name === "Behemoth" && (
                                <div style={{ marginTop: 7, color: "#bdb3a0", fontSize: 10 }}>
                                    КАСТ — движение чудища + рёв над флагом · 1 с.
                                </div>
                            )}
                            <div style={{ marginTop: 8, color: "#8f877b", fontSize: 9.5 }}>
                                Движение мышью · WASD — шаг. Сверху ставятся красные, снизу — зелёные.
                            </div>
                        </div>
                    </section>
                </aside>
            )}
        </>
    );
};
