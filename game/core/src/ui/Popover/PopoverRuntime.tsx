import React, { useEffect, useRef, useState } from "react";
import { AttackVals, MovementVals } from "@heroesofcrypto/common";

import { HOC_GAME_FONT_FAMILY } from "../../fontFamilies";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IHoverInfo, ISpellEffectSummary, SpellEffectSummaryKind } from "../../scenes/VisibleState";
import { spellElementStyle, type SpellElementStyle } from "../spellElementStyle";
import { popoverPositionAtPointer } from "./popoverPosition";

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

/**
 * The spellbook headline: one scan-friendly number for what the spell actually does, above the rules text.
 * Colour carries the KIND (damage / healing / buff / debuff) so the answer to "is this good for me?" lands
 * before a word is read, and the figure itself comes from the same calculation the card body prints.
 */
const SPELL_EFFECT_COLORS: Record<
    SpellEffectSummaryKind,
    { border: string; background: string; label: string; value: string }
> = {
    damage: { border: "#ff8a55", background: "rgba(111, 34, 18, 0.82)", label: "#ffb18b", value: "#ffe0c7" },
    healing: { border: "#56d89c", background: "rgba(15, 83, 57, 0.82)", label: "#87ebba", value: "#d5ffe9" },
    buff: { border: "#6fb8ff", background: "rgba(20, 65, 110, 0.82)", label: "#9dd0ff", value: "#e0f1ff" },
    debuff: { border: "#d58aff", background: "rgba(77, 31, 104, 0.82)", label: "#e4b0ff", value: "#f5e2ff" },
};

const spellEffectSummaryCard = (summary: ISpellEffectSummary): React.JSX.Element => {
    const colors = SPELL_EFFECT_COLORS[summary.kind];
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "fit-content",
                minWidth: "170px",
                marginTop: "6px",
                marginBottom: "5px",
                padding: "6px 10px",
                border: `1px solid ${colors.border}`,
                borderLeftWidth: "4px",
                borderRadius: "5px",
                background: colors.background,
                boxShadow: `0 0 10px ${colors.background}`,
                fontFamily: HOC_GAME_FONT_FAMILY,
            }}
        >
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span
                    style={{
                        color: colors.label,
                        fontSize: "0.72em",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        lineHeight: 1.1,
                        textTransform: "uppercase",
                    }}
                >
                    {summary.label}
                </span>
                {summary.detail ? (
                    <span style={{ marginTop: "2px", color: "rgba(255, 255, 255, 0.78)", fontSize: "0.75em" }}>
                        {summary.detail}
                    </span>
                ) : null}
            </span>
            <span
                style={{
                    marginLeft: "auto",
                    color: colors.value,
                    fontSize: "1.2em",
                    fontWeight: 900,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                }}
            >
                {summary.value}
            </span>
        </div>
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
                {hoverInfo.spellEffectSummary ? spellEffectSummaryCard(hoverInfo.spellEffectSummary) : null}
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
    const pointerPositionRef = useRef({ x: 0, y: 0 });
    const popoverRef = useRef<HTMLDivElement>(null);

    const [hoverInfo, setHoverInfo] = useState({} as IHoverInfo);

    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onHoverInfoUpdated.connect(setHoverInfo);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    // Show the box ONLY when it actually has something to render. The scene emits a fully-keyed hover object
    // (~9 keys) the instant the sword/attack cursor engages — purely to drive that cursor — but with every
    // content field blank. Gating on `Object.keys(...).length` therefore flashed an empty ~20px dark box 10px
    // off the cursor's bottom-right. Mirror the three content helpers' own guards so the box appears only with
    // real content (a unit line, an attack line, or an information message).
    const hasPopoverContent =
        !!hoverInfo.information?.length ||
        !!(hoverInfo.unitName && hoverInfo.attackType) ||
        !!(hoverInfo.attackType && (hoverInfo.damageSpread || hoverInfo.damageRangeDivisor));

    useEffect(() => {
        let frameId = 0;
        const paintPosition = () => {
            frameId = 0;
            const popover = popoverRef.current;
            if (!popover) return;
            const position = popoverPositionAtPointer(pointerPositionRef.current, window.innerHeight);
            popover.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
        };
        const handleMouseMove = (event: MouseEvent) => {
            pointerPositionRef.current = { x: event.clientX, y: event.clientY };
            // Keep the last pointer coordinates cheaply while hidden. Gaming mice can emit far more
            // events than the display can paint, so coalesce direct style writes to one per frame.
            if (!hasPopoverContent || frameId) return;
            frameId = window.requestAnimationFrame(paintPosition);
        };

        window.addEventListener("mousemove", handleMouseMove);
        if (hasPopoverContent) paintPosition();
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (frameId) window.cancelAnimationFrame(frameId);
        };
    }, [hasPopoverContent]);

    return (
        <div
            ref={popoverRef}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                transform: "translate3d(0, 0, 0)",
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
