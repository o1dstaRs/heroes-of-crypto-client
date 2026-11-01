import React from "react";

import { t } from "../../i18n/i18n";

export const TouchSplitAmount: React.FC<{
    value: number;
    max: number;
    disabled?: boolean;
    onChange: (value: number) => void;
}> = ({ value, max, disabled, onChange }) => (
    <div className="hoc-touch-split-amount" role="group" aria-label={t("Split amount")}>
        <button
            disabled={disabled || value <= 1}
            aria-label={t("Decrease split amount")}
            onClick={() => onChange(value - 1)}
        >
            −
        </button>
        <input
            type="number"
            inputMode="numeric"
            aria-label={t("Split amount")}
            min={1}
            max={Math.max(1, max)}
            step={1}
            disabled={disabled}
            value={value}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isFinite(next)) onChange(Math.max(1, Math.min(max, Math.floor(next))));
            }}
        />
        <button
            disabled={disabled || value >= max}
            aria-label={t("Increase split amount")}
            onClick={() => onChange(value + 1)}
        >
            +
        </button>
    </div>
);
