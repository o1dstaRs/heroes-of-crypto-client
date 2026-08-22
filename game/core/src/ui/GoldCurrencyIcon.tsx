import React from "react";

import goldCurrencyIconUrl from "../../../../site/public/assets/icons/currency/gold.svg";
import { currencyIconSvgDataUrl } from "../api/ranked_season_client";

export interface CurrencyIconProps {
    /** Raw, normalized season SVG. It is encoded into an image URL and never injected as markup. */
    iconSvg?: string | null;
    /** Adds a warm lift for hero balances and wager moments; compact utility badges stay flat. */
    prominent?: boolean;
    size: number;
}

/** A seasonal currency icon with the canonical Heroes of Crypto gold coin as its legacy fallback. */
export const CurrencyIcon: React.FC<CurrencyIconProps> = ({ iconSvg, prominent = false, size }) => (
    <img
        src={currencyIconSvgDataUrl(iconSvg) ?? goldCurrencyIconUrl}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
            display: "block",
            flexShrink: 0,
            objectFit: "contain",
            filter: prominent
                ? "drop-shadow(0 3px 5px rgba(0,0,0,0.72)) drop-shadow(0 0 8px rgba(220,177,88,0.26))"
                : undefined,
        }}
    />
);

/** Backwards-compatible name for callers that still rely on the bundled gold fallback. */
export const GoldCurrencyIcon = CurrencyIcon;
