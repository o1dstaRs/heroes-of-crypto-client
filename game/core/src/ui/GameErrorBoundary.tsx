import { Box, Button, Stack, Typography } from "@mui/joy";
import React from "react";

import { reportClientError } from "./clientErrorReport";
import { hocColors, hocPrimaryButtonSx } from "./hocTheme";

interface Props {
    /** Names the screen in the report (route + game id). */
    context: string;
    children?: React.ReactNode;
}

interface State {
    message: string | null;
}

/**
 * A render error inside the fight view unmounts the whole app — a white page. Catch it here instead:
 * report it to the server, and show what broke with a way back in (a reload re-joins the same game).
 */
export class GameErrorBoundary extends React.Component<Props, State> {
    public override state: State = { message: null };
    public static getDerivedStateFromError(error: unknown): State {
        return { message: error instanceof Error ? error.message : String(error) };
    }
    public override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
        reportClientError(error, "react", `${this.props.context} ${info.componentStack?.slice(0, 600) ?? ""}`);
    }
    public override render(): React.ReactNode {
        if (this.state.message === null) {
            return this.props.children;
        }
        return (
            <Box
                sx={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "#07090d",
                    color: hocColors.parchment,
                    px: 2,
                }}
            >
                <Stack spacing={2} alignItems="center" sx={{ maxWidth: 640, textAlign: "center" }}>
                    <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                        Something broke on this screen
                    </Typography>
                    <Typography level="body-sm" sx={{ color: hocColors.muted, wordBreak: "break-word" }}>
                        {this.state.message}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        The error was reported. Reloading brings you back into the same game.
                    </Typography>
                    <Button sx={hocPrimaryButtonSx} onClick={() => window.location.reload()}>
                        Reload
                    </Button>
                </Stack>
            </Box>
        );
    }
}
