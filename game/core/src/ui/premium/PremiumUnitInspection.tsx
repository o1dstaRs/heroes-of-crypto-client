import React, { createContext, useContext } from "react";
import Tooltip from "@mui/joy/Tooltip";

import { PremiumButton } from "./PremiumButton";
import { useAskPremiumQuestion, type PremiumInspectionFocus } from "./PremiumSearchPromptContext";
import { premiumUnitQuestion } from "./premiumQuestions";
import { PremiumIcon } from "../PremiumIcon";

export const PremiumUnitInspectionContext = createContext<PremiumInspectionFocus | undefined>(undefined);

export const PremiumUnitQuestionButton: React.FC<{
    topic?: { kind: "ability" | "status"; name: string };
    iconOnly?: boolean;
}> = ({ topic, iconOnly = false }) => {
    const focus = useContext(PremiumUnitInspectionContext);
    const askQuestion = useAskPremiumQuestion();
    if (!focus || !askQuestion) return null;
    const label = `Ask Premium about ${topic ? `${topic.name} on ` : ""}${focus.name}`;
    const button = (
        <PremiumButton
            size="sm"
            variant="plain"
            aria-label={label}
            startDecorator={iconOnly ? null : undefined}
            onClick={(event) => {
                event.stopPropagation();
                askQuestion(premiumUnitQuestion(focus.name, topic), focus);
            }}
            sx={{
                minHeight: iconOnly ? 22 : 24,
                minWidth: iconOnly ? 22 : undefined,
                px: iconOnly ? 0 : 0.5,
                py: 0,
                fontSize: 11,
                alignSelf: "center",
                flexShrink: 0,
            }}
        >
            {iconOnly ? <PremiumIcon size={16} /> : topic ? "Ask Premium" : "Ask about this unit"}
        </PremiumButton>
    );
    return iconOnly ? (
        <Tooltip title={label} describeChild>
            {button}
        </Tooltip>
    ) : (
        button
    );
};
