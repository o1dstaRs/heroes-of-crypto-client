import React from "react";

import { Box, Tooltip } from "@mui/joy";

import questionMarkImage from "../../../images/icon_question_mark_128.webp";

const HelpQuestionMarkIcon: React.FC<{
    setModalClosed: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ setModalClosed }) => (
    <Tooltip title={"Show what is happening"} placement="top">
        <Box
            sx={{
                position: "absolute",
                top: "5%", // Anchor to the bottom side
                left: "46%",
                // transform: "translate(-50%, 50%)",
                zIndex: 50,
                animation: "wobble 3s ease-in-out infinite", // Add wobble effect
                "@keyframes wobble": {
                    "0%, 100%": { transform: "translate(-50%, 5%)" },
                    "25%": { transform: "translate(-50%, 0%) rotate(-5deg)" },
                    "50%": { transform: "translate(-50%, 10%) rotate(5deg)" },
                    "75%": { transform: "translate(-50%, 0%) rotate(-5deg)" },
                },
            }}
        >
            <img
                src={questionMarkImage}
                alt="Question Mark"
                style={{
                    width: "40%",
                    display: "block",
                    margin: "0 auto",
                    cursor: "pointer", // Add pointer cursor
                    transition: "filter 0.3s ease", // Transition for filter
                    filter: "brightness(1)", // Base filter
                }}
                onClick={() => setModalClosed(false)}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.3)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
            />
        </Box>
    </Tooltip>
);

export default HelpQuestionMarkIcon;
