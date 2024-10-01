import { TeamType } from "@heroesofcrypto/common";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import Button from "@mui/joy/Button";
import Card from "@mui/joy/Card";
import LinearProgress from "@mui/joy/LinearProgress";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { useManager } from "../../manager";
import { IVisibleState } from "../../state/visible_state";

export const MessageBox = ({ gameStarted }: { gameStarted: boolean }) => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    let messageBoxVariant: "plain" | "outlined" | "soft" | "solid" | undefined;
    let messageBoxColor: "primary" | "neutral" | "danger" | "success" | "warning" | undefined;
    let messageBoxTitle;
    let messageBoxText;
    let messageBoxButtonText;
    let messageBoxRequestAdditionalTimeButtonRendered = false;
    let messageBoxProgressBar: React.JSX.Element;
    let messageBoxProgressValue = gameStarted ? 0 : 80;
    if (visibleState.secondsMax) {
        messageBoxProgressValue = 100 - (visibleState.secondsRemaining / visibleState.secondsMax) * 100;
    }
    const progress = (
        <LinearProgress
            variant="outlined"
            determinate={gameStarted}
            value={messageBoxProgressValue}
            sx={{ my: 1, overflow: "hidden" }}
        />
    );
    const defaultIcon =
        visibleState.lapNumber &&
        visibleState.lapNumber < visibleState.numberOfLapsTillStopNarrowing &&
        !(visibleState.lapNumber % visibleState.numberOfLapsTillNarrowing) ? (
            <ZoomInMapIcon />
        ) : (
            <TimelapseRoundedIcon />
        );

    if (gameStarted) {
        messageBoxVariant = "soft";
        if (visibleState.hasFinished) {
            messageBoxColor = "neutral";
            messageBoxTitle = "Fight finished";
            messageBoxText = "Refresh the page to start a new one";
            messageBoxButtonText = "";
            messageBoxProgressBar = <span />;
        } else {
            if (messageBoxProgressValue <= 45) {
                messageBoxColor = "success";
                messageBoxButtonText = "";
            } else if (messageBoxProgressValue <= 70) {
                messageBoxColor = "warning";
                messageBoxButtonText = "";
            } else {
                messageBoxColor = "danger";
                if (visibleState.canRequestAdditionalTime) {
                    messageBoxButtonText = "Use additional time";
                    messageBoxRequestAdditionalTimeButtonRendered = true;
                }
            }
            messageBoxTitle = `Lap ${visibleState.lapNumber}`;
            if (!visibleState.teamTypeTurn) {
                messageBoxText = "Calculating next turn.";
            } else if (visibleState.teamTypeTurn === TeamType.LOWER) {
                messageBoxText = "Green team is making a turn";
            } else {
                messageBoxText = "Red team is making a turn";
            }
            messageBoxProgressBar = progress;
        }
    } else {
        messageBoxProgressBar = progress;
        messageBoxVariant = "solid";
        messageBoxColor = "primary";
        messageBoxTitle = "To start";
        messageBoxText =
            "Place the units from both teams on the board. Make sure to have at least one unit on both the top and bottom sides.";
        if (visibleState.canBeStarted) {
            messageBoxButtonText = "Start";
        } else {
            messageBoxButtonText = "";
        }
    }

    return (
        <Card invertedColors variant={messageBoxVariant} color={messageBoxColor} size="sm" sx={{ boxShadow: "none" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="title-sm">{messageBoxTitle}</Typography>
                {(() => {
                    if (gameStarted) {
                        if (visibleState.hasFinished) {
                            return <RefreshRoundedIcon />;
                        }
                        return defaultIcon;
                    }
                    return <InfoRoundedIcon />;
                })()}
            </Stack>
            <Typography level="body-xs">{messageBoxText}</Typography>
            {messageBoxProgressBar}

            {messageBoxButtonText ? (
                <Button
                    onClick={() =>
                        messageBoxRequestAdditionalTimeButtonRendered
                            ? manager.RequestTime(visibleState.teamTypeTurn)
                            : manager.StartGame()
                    }
                    onMouseDown={() =>
                        messageBoxRequestAdditionalTimeButtonRendered
                            ? manager.RequestTime(visibleState.teamTypeTurn)
                            : manager.StartGame()
                    }
                    size="sm"
                    variant="solid"
                >
                    {messageBoxButtonText}
                </Button>
            ) : (
                <span />
            )}
        </Card>
    );
};