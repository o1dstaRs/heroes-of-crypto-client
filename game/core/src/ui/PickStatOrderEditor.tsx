import React from "react";
import { savePickStatOrder, selectPickStat, setPickStatEditing, usePickStatOrder } from "./pickStatOrder";
import { DEFAULT_PICK_STAT_ORDER, PICK_STAT_LABELS } from "./pickStatOrderModel";

export const PickStatOrderEditor: React.FC = () => {
    const state = usePickStatOrder();
    const busy = state.status === "loading" || state.status === "saving";
    return (
        <div className="pick-stat-order" aria-label="Порядок характеристик">
            <button
                type="button"
                aria-pressed={state.editing}
                disabled={busy}
                onClick={() => setPickStatEditing(!state.editing)}
            >
                {state.editing ? "Готово · характеристики" : "⇄ Переставить характеристики"}
            </button>
            {state.editing && (
                <>
                    <span className="pick-preview-order-help">
                        {state.selected
                            ? "Выберите второй блок для обмена."
                            : "Нажмите два блока, чтобы поменять их местами."}
                    </span>
                    <div className="pick-stat-order-grid">
                        {state.order.map((id, index) => (
                            <button
                                key={id}
                                type="button"
                                disabled={busy}
                                aria-pressed={state.selected === id}
                                onClick={() => selectPickStat(id)}
                            >
                                {index + 1}. {PICK_STAT_LABELS[id]}
                            </button>
                        ))}
                    </div>
                    <span className="pick-preview-order-help">Дальность и боезапас видны только у стрелков.</span>
                    <span className="pick-preview-order-help" role="status">
                        {state.status === "saved"
                            ? "Порядок сохранён на локальном сервере"
                            : state.status === "saving"
                              ? "Сохранение…"
                              : state.status === "loading"
                                ? "Загрузка…"
                                : state.status === "error"
                                  ? "Не удалось сохранить порядок на сервере"
                                  : "Порядок хранится в этом браузере"}
                    </span>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void savePickStatOrder(DEFAULT_PICK_STAT_ORDER)}
                    >
                        Сбросить характеристики
                    </button>
                    {state.status === "error" && (
                        <button type="button" onClick={() => void savePickStatOrder(state.order)}>
                            Повторить сохранение
                        </button>
                    )}
                </>
            )}
        </div>
    );
};
