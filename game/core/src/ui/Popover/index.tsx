import React, { useEffect, useState } from "react";
import { AttackType, MovementType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";
import { IHoverInfo } from "../../stats/damage_stats";

const getLevelEmoji = (hoverInfo: IHoverInfo): string => {
    let levelEmoji = "";

    if (hoverInfo.unitLevel === 1) {
        levelEmoji = "1️⃣";
    } else if (hoverInfo.unitLevel === 2) {
        levelEmoji = "2️⃣";
    } else if (hoverInfo.unitLevel === 3) {
        levelEmoji = "3️⃣";
    } else if (hoverInfo.unitLevel === 4) {
        levelEmoji = "4️⃣";
    }

    return levelEmoji;
};

const getAttackEmojiByType = (hoverInfo: IHoverInfo): string => {
    let attackTypeEmoji = "🗡️";
    if (hoverInfo.attackType === AttackType.RANGE) {
        attackTypeEmoji = "🏹";
    } else if (hoverInfo.attackType === AttackType.MAGIC) {
        attackTypeEmoji = "💥";
    }

    return attackTypeEmoji;
};

const getMovementEmojiByType = (hoverInfo: IHoverInfo): string => {
    let movementEmoji = "🦶";
    if (hoverInfo.unitMovementType === MovementType.FLY) {
        movementEmoji = "🪽";
    }

    return movementEmoji;
};

const toLevelString = (hoverInfo: IHoverInfo): string => {
    if (!hoverInfo.unitLevel) {
        return "";
    }

    return `${getLevelEmoji(hoverInfo)} Level`;
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
            <span>
                {getMovementEmojiByType(hoverInfo)} {hoverInfo.unitName}
            </span>
            <br />
            <span>
                {attackTypeEmoji} {attackTypeStr}
            </span>
            <br />
            <span>{toLevelString(hoverInfo)}</span>
        </>
    );
};

const unitAttackElement = (hoverInfo: IHoverInfo): JSX.Element => {
    if (!hoverInfo.attackType || !(hoverInfo.damageSpread || hoverInfo.damageRangeDivisor)) {
        return <></>;
    }

    const rangeDivisorString = toRangeDivisorString(hoverInfo);
    const attackString = toAttackString(hoverInfo);

    return (
        <>
            {rangeDivisorString}
            {rangeDivisorString && attackString && <br />}
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
        const connection = manager.onHoverInfoUpdated.connect(setHoverInfo);
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
                zIndex: 3,
            }}
        >
            {generalInfoElement(hoverInfo)}
            {unitInfoElement(hoverInfo)}
            {unitAttackElement(hoverInfo)}
        </div>
    );
};

export default Popover;
