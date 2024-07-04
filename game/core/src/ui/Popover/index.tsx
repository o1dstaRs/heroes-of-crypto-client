import React, { useEffect, useState } from "react";
import { AttackType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
import { IHoverInfo } from "../../stats/damage_stats";

const getAttackEmojiByType = (hoverInfo: IHoverInfo): string => {
    let attackTypeEmoji = "🗡️";
    if (hoverInfo.attackType === AttackType.RANGE) {
        attackTypeEmoji = "🏹";
    } else if (hoverInfo.attackType === AttackType.MAGIC) {
        attackTypeEmoji = "💥";
    }

    return attackTypeEmoji;
};

const toAttackString = (hoverInfo: IHoverInfo): string => {
    if (!hoverInfo.attackType || !hoverInfo.damageSpread) {
        return "";
    }

    return `${getAttackEmojiByType(hoverInfo)} ${hoverInfo.damageSpread}`;
};

const toKillsString = (hoverInfo: IHoverInfo): string => {
    if (!hoverInfo.killsSpread) {
        return "";
    }

    return `💀 ${hoverInfo.killsSpread}`;
};

const toRangeDivisorString = (hoverInfo: IHoverInfo): string => {
    if (!hoverInfo.damageRangeDivisor) {
        return "";
    }

    return `🎯 ${hoverInfo.damageRangeDivisor}`;
};

const generalInfoElement = (hoverInfo: IHoverInfo): JSX.Element => {
    if (!hoverInfo.information?.length) {
        return <></>;
    }

    console.log("Ssss");
    console.log(hoverInfo.information);

    return (
        <>
            <span>
                {hoverInfo.information.map((info, index) => (
                    <React.Fragment key={index}>
                        {info}
                        {index < hoverInfo.information.length - 1 && <br />}
                    </React.Fragment>
                ))}
            </span>
        </>
    );
};

const unitInfoElement = (hoverInfo: IHoverInfo): JSX.Element => {
    if (!hoverInfo.unitName || !hoverInfo.attackType) {
        return <></>;
    }

    let attackTypeStr = "Melee";
    let attackTypeEmoji = "🗡️";
    if (hoverInfo.attackType === AttackType.RANGE) {
        attackTypeEmoji = "🏹";
        attackTypeStr = "Range";
    } else if (hoverInfo.attackType === AttackType.MAGIC) {
        attackTypeEmoji = "💥";
        attackTypeStr = "Magic";
    }

    return (
        <>
            <span>🐙 {hoverInfo.unitName}</span>
            <br />
            <span>
                {attackTypeEmoji} {attackTypeStr}
            </span>
        </>
    );
};

const unitAttackElement = (hoverInfo: IHoverInfo): JSX.Element => {
    if (!hoverInfo.attackType || !hoverInfo.damageSpread) {
        return <></>;
    }

    const rangeDivisorString = toRangeDivisorString(hoverInfo);

    return (
        <>
            {rangeDivisorString}
            {rangeDivisorString && <br />}
            {toAttackString(hoverInfo)}
            <br /> {toKillsString(hoverInfo)}
        </>
    );
};

const Popover: React.FC = () => {
    const [positionPopover, setPositionPopover] = useState({ x: 0, y: 0 });
    const [visiblePopover, setVisiblePopover] = useState(true);

    const [hoverInfo, setHoverInfo] = useState({} as IHoverInfo);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onPossibleAttackRangeUpdated.connect(setHoverInfo);
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

    if (Object.keys(hoverInfo).length === 0 && visiblePopover) {
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

    return (
        <div
            style={{
                position: "fixed",
                top: positionPopover.y + 10, // Offset to avoid overlapping with the cursor
                left: positionPopover.x + 10,
                display: Object.keys(hoverInfo).length ? "block" : "none",
                padding: "10px",
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                color: "white",
                borderRadius: "5px",
                pointerEvents: "none", // Prevent the popover from intercepting mouse events
            }}
        >
            {generalInfoElement(hoverInfo)}
            {unitInfoElement(hoverInfo)}
            {unitAttackElement(hoverInfo)}
        </div>
    );
};

export default Popover;
