import React from "react";

import premiumIconUrl from "../../../../site/public/assets/icons/premium.svg";
import "./premium/premiumBrand.css";

export const PremiumIcon: React.FC<{ size?: number | string; style?: React.CSSProperties }> = ({
    size = "1.25em",
    style,
}) => (
    <span
        className="premium-icon"
        aria-hidden="true"
        style={{
            display: "inline-block",
            flexShrink: 0,
            width: size,
            height: size,
            verticalAlign: "-0.2em",
            backgroundColor: "var(--hoc-premium-accent)",
            WebkitMask: `url("${premiumIconUrl}") center / contain no-repeat`,
            mask: `url("${premiumIconUrl}") center / contain no-repeat`,
            ...style,
        }}
    />
);
