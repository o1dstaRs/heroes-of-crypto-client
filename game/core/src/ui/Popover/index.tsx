import React, { useEffect, useState } from "react";
import { AttackVals, MovementVals } from "@heroesofcrypto/common";

import { HOC_GAME_FONT_FAMILY } from "../../fontFamilies";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IHoverInfo } from "../../scenes/VisibleState";
import { spellElementStyle, type SpellElementStyle } from "../spellElementStyle";

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
    if (hoverInfo.attackType === AttackVals.RANGE) {
        attackTypeEmoji = "🏹";
    } else if (hoverInfo.attackType === AttackVals.MAGIC) {
        attackTypeEmoji = "💥";
    }

    return attackTypeEmoji;
};

const getMovementEmojiByType = (hoverInfo: IHoverInfo): string => {
    let movementEmoji = "🦶";
    if (hoverInfo.unitMovementType === MovementVals.FLY) {
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

/**
 * The hovered spell's element, as a chip in that element's own colour.
 *
 * Elementless spells — which is most of the book — render nothing, so the card is unchanged for them.
 */
const spellElementChip = (style: SpellElementStyle): React.JSX.Element => {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                marginTop: "2px",
                marginBottom: "2px",
                padding: "1px 8px",
                borderRadius: "999px",
                border: `1px solid ${style.border}`,
                background: style.background,
                color: style.color,
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontWeight: 800,
                fontSize: "0.82em",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
            }}
        >
            <span aria-hidden="true">{style.mark}</span>
            {style.label}
        </span>
    );
};

const generalInfoElement = (hoverInfo: IHoverInfo): React.JSX.Element => {
    if (!hoverInfo.information?.length) {
        return <></>;
    }

    // The element rides directly under the spell's NAME (the first line) — it changes who the spell can
    // legally be aimed at, so it belongs with the title rather than buried under the body text.
    const [title, ...rest] = hoverInfo.information;
    const elementStyle = spellElementStyle(hoverInfo.spellElement);

    return (
        <>
            <span>
                {title}
                {elementStyle ? (
                    <>
                        <br />
                        {spellElementChip(elementStyle)}
                    </>
                ) : null}
                {rest.map((info, index) => (
                    <React.Fragment key={index}>
                        <br />
                        {info}
                    </React.Fragment>
                ))}
            </span>
        </>
    );
};

const unitInfoElement = (hoverInfo: IHoverInfo): React.JSX.Element => {
    if (!hoverInfo.unitName || !hoverInfo.attackType) {
        return <></>;
    }

    let attackTypeStr = "Melee";
    let attackTypeEmoji = "🗡️";
    if (hoverInfo.attackType === AttackVals.RANGE) {
        attackTypeEmoji = "🏹";
        attackTypeStr = "Range";
    } else if (hoverInfo.attackType === AttackVals.MAGIC) {
        attackTypeEmoji = "💥";
        attackTypeStr = "Magic";
    } else if (hoverInfo.attackType === AttackVals.MELEE_MAGIC) {
        attackTypeEmoji = "🗡️💥";
        attackTypeStr = "Melee magic";
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

const unitAttackElement = (hoverInfo: IHoverInfo): React.JSX.Element => {
    if (!hoverInfo.attackType || !(hoverInfo.damageSpread || hoverInfo.damageRangeDivisor)) {
        return <></>;
    }

    const rangeDivisorString = toRangeDivisorString(hoverInfo);
    const attackString = toAttackString(hoverInfo);

    return (
        <span
            style={{
                display: "inline-block",
                fontSize: "50%",
                lineHeight: 1.1,
            }}
        >
            {rangeDivisorString}
            {rangeDivisorString && attackString && <br />}
            {attackString}
            <br /> {toKillsString(hoverInfo)}
        </span>
    );
};

const Popover: React.FC = () => {
    const [positionPopover, setPositionPopover] = useState({ x: 0, y: 0 });
    const [visiblePopover, setVisiblePopover] = useState(true);

    const [hoverInfo, setHoverInfo] = useState({} as IHoverInfo);

    const manager = usePixiManager();

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

    // Show the box ONLY when it actually has something to render. The scene emits a fully-keyed hover object
    // (~9 keys) the instant the sword/attack cursor engages — purely to drive that cursor — but with every
    // content field blank. Gating on `Object.keys(...).length` therefore flashed an empty ~20px dark box 10px
    // off the cursor's bottom-right. Mirror the three content helpers' own guards so the box appears only with
    // real content (a unit line, an attack line, or an information message).
    const hasPopoverContent =
        !!hoverInfo.information?.length ||
        !!(hoverInfo.unitName && hoverInfo.attackType) ||
        !!(hoverInfo.attackType && (hoverInfo.damageSpread || hoverInfo.damageRangeDivisor));

    return (
        <div
            style={{
                position: "fixed",
                top:
                    positionPopover.y >= window.innerHeight - window.innerHeight / 16
                        ? positionPopover.y - 70
                        : positionPopover.y + 10, // Offset to avoid overlapping with the cursor
                left: positionPopover.x + 10,
                display: hasPopoverContent ? "block" : "none",
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
