import { HoCConstants } from "@heroesofcrypto/common";
import React from "react";

import { tf } from "../i18n/i18n";
import "./synergyLevelDots.css";

export const SynergyLevelDots: React.FC<{ faction: string; level: number }> = ({ faction, level }) => {
    if (!Number.isInteger(level) || level < 1 || level > HoCConstants.MAX_SYNERGY_LEVEL) {
        return null;
    }

    return (
        <span
            className="hoc-synergy-level-dots"
            role="img"
            aria-label={tf("Synergy level {level}", { level })}
            data-faction={faction}
        >
            {Array.from({ length: level }, (_, index) => (
                <span key={index} data-synergy-level-dot />
            ))}
        </span>
    );
};
