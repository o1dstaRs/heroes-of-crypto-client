import React, { useEffect, useState } from "react";
import { AttackType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
import { IDamageSpread } from "../../stats/damage_stats";

const toAttackString = (damageSpread: IDamageSpread): string => {
    if (!damageSpread.attackType) {
        return "";
    }

    let attackTypeEmoji = "🗡️";
    if (damageSpread.attackType === AttackType.RANGE) {
        attackTypeEmoji = "🏹";
    } else if (damageSpread.attackType === AttackType.MAGIC) {
        attackTypeEmoji = "💥";
    }

    return `${attackTypeEmoji} ${damageSpread.damageSpread}`;
};

const toKillsString = (damageSpread: IDamageSpread): string => {
    if (!damageSpread.killsSpread) {
        return "";
    }

    return `💀 ${damageSpread.killsSpread}`;
};

const toRangeDivisorString = (damageSpread: IDamageSpread): string => {
    if (!damageSpread.damageRangeDivisor) {
        return "";
    }

    return `🎯 ${damageSpread.damageRangeDivisor}`;
};

const Popover: React.FC = () => {
    const [positionPopover, setPositionPopover] = useState({ x: 0, y: 0 });
    const [visiblePopover, setVisiblePopover] = useState(true);

    const [damageSpread, setDamageSpread] = useState({} as IDamageSpread);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onPossibleAttackRangeUpdated.connect(setDamageSpread);
        return () => {
            connection.disconnect();
        };
    });

    const handleMouseMove = (event: MouseEvent) => {
        setPositionPopover({
            x: event.clientX,
            y: event.clientY,
        });
    };

    const handleMouseLeave = () => {
        setVisiblePopover(false);
    };

    if (Object.keys(damageSpread).length === 0 && visiblePopover) {
        setVisiblePopover(false);
    }

    useEffect(() => {
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseleave", handleMouseLeave);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseleave", handleMouseLeave);
        };
    }, []);

    const rangeDivisorString = toRangeDivisorString(damageSpread);

    return (
        <div
            style={{
                position: "fixed",
                top: positionPopover.y + 10, // Offset to avoid overlapping with the cursor
                left: positionPopover.x + 10,
                display: Object.keys(damageSpread).length ? "block" : "none",
                padding: "10px",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                color: "white",
                borderRadius: "5px",
                pointerEvents: "none", // Prevent the popover from intercepting mouse events
            }}
        >
            {rangeDivisorString}
            {rangeDivisorString && <br />}
            {toAttackString(damageSpread)}
            <br /> {toKillsString(damageSpread)}
        </div>
    );
};

export default Popover;
