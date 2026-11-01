import React, { useState } from "react";

import { t } from "../../i18n/i18n";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { useGameLayout } from "./GameViewport";

export default function TouchArmyRoster() {
    const manager = usePixiManager();
    const { setPanel } = useGameLayout();
    const [level, setLevel] = useState(1);
    const creatures = manager.GetTouchCreatureChoices();
    if (!creatures.length) return null;
    return (
        <section className="hoc-touch-roster" aria-label={t("Choose a creature")}>
            <div className="hoc-touch-roster-levels" role="group" aria-label={t("Creature level")}>
                {[1, 2, 3, 4].map((value) => (
                    <button key={value} aria-pressed={value === level} onClick={() => setLevel(value)}>
                        L{value}
                    </button>
                ))}
            </div>
            <div className="hoc-touch-roster-grid">
                {creatures
                    .filter((creature) => creature.level === level)
                    .map((creature) => (
                        <button
                            key={creature.name}
                            onClick={() => {
                                if (manager.SelectTouchCreature(creature.name)) setPanel(null);
                            }}
                        >
                            <CreaturePortraitImage
                                creatureId={creature.creatureId}
                                sx={{ width: "100%", height: 76, flex: "none", pointerEvents: "none" }}
                            />
                            <span>{t(creature.name)}</span>
                        </button>
                    ))}
            </div>
        </section>
    );
}
