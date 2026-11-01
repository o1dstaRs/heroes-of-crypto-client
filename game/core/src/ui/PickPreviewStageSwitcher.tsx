import React from "react";
import { PickStatOrderEditor } from "./PickStatOrderEditor";
import { useLocation, useNavigate } from "react-router";
import { resetPickPreviewOrder, setPickPreviewOrderEditing, usePickPreviewOrder } from "./pickPreviewOrder";

import "./pickPreviewStageSwitcher.css";

const STAGES = [
    { path: "/preview/picks/bundle", label: "Стартовый набор" },
    { path: "/preview/picks/level1", label: "L1 · Существа" },
    { path: "/preview/picks/level2", label: "L2 · Существа" },
    { path: "/preview/picks/map", label: "Открытие карты" },
    { path: "/preview/picks/level3", label: "L3 · Существа" },
    { path: "/preview/picks/artifact2", label: "Артефакт II" },
    { path: "/preview/picks/level4", label: "L4 · Существа" },
    { path: "/preview/augments", label: "Усиления" },
    { path: "/preview/placement", label: "Расстановка" },
] as const;

/** Navigation between offline visual fixtures, never mounted in a live draft. */
export const PickPreviewStageSwitcher: React.FC = () => {
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const orderEditor = usePickPreviewOrder();
    const level = Number(pathname.match(/^\/preview\/picks\/level([1-4])$/)?.[1] ?? 0);
    const index = STAGES.findIndex((stage) => stage.path === pathname);
    if (index < 0) return null;

    const go = (path: string) => navigate({ pathname: path, search });
    return (
        <nav className="pick-preview-stages" aria-label="Переключение стадий пика">
            {index < STAGES.length - 1 && (
                <div className="pick-preview-order" aria-label="Порядок карточек">
                    {level > 0 && (
                        <>
                            <span className="pick-preview-order-help" role="status">
                                {orderEditor.serverStatus === "saved"
                                    ? "Порядок сохранён на локальном сервере"
                                    : orderEditor.serverStatus === "saving"
                                      ? "Сохранение на сервере…"
                                      : orderEditor.serverStatus === "loading"
                                        ? "Загрузка порядка…"
                                        : orderEditor.serverStatus === "error"
                                          ? "Не удалось сохранить на сервере; порядок остался в браузере"
                                          : "Порядок пока хранится в этом браузере"}
                            </span>
                            {orderEditor.editing && (
                                <span className="pick-preview-order-help" role="status">
                                    {orderEditor.saveError
                                        ? "Не удалось сохранить порядок на сервере"
                                        : orderEditor.selected?.level === level
                                          ? "Выберите вторую карточку для обмена"
                                          : "Выберите две карточки. Порядок сохраняется автоматически."}
                                </span>
                            )}
                            <button
                                type="button"
                                aria-pressed={orderEditor.editing}
                                disabled={
                                    orderEditor.serverStatus === "loading" || orderEditor.serverStatus === "saving"
                                }
                                onClick={() => setPickPreviewOrderEditing(!orderEditor.editing)}
                            >
                                {orderEditor.editing ? "Готово" : "⇄ Переставить карточки"}
                            </button>
                            {orderEditor.editing && (
                                <button
                                    type="button"
                                    disabled={!orderEditor.orders[level]}
                                    onClick={() => resetPickPreviewOrder(level)}
                                >
                                    Сбросить L{level}
                                </button>
                            )}
                        </>
                    )}
                    <PickStatOrderEditor />
                </div>
            )}
            <button
                type="button"
                aria-label="Предыдущая стадия пика"
                title="Предыдущая стадия"
                disabled={index === 0}
                onClick={() => go(STAGES[index - 1].path)}
            >
                ‹
            </button>
            <select aria-label="Стадия пика" value={pathname} onChange={(event) => go(event.target.value)}>
                {STAGES.map((stage) => (
                    <option key={stage.path} value={stage.path}>
                        {stage.label}
                    </option>
                ))}
            </select>
            <button
                type="button"
                aria-label="Следующая стадия пика"
                title="Следующая стадия"
                disabled={index === STAGES.length - 1}
                onClick={() => go(STAGES[index + 1].path)}
            >
                ›
            </button>
        </nav>
    );
};
