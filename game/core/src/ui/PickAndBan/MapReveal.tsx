import { Box, Button, Modal, ModalDialog, Sheet, Tooltip, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images as rawImages } from "../../generated/image_imports";
import { getMapDisplay } from "./mapDisplay";

const images = rawImages as Record<string, string>;

// How long the reveal modal stays up before auto-dismissing (the player can dismiss instantly via Continue).
const AUTO_DISMISS_MS = 7000;

// The pop-in keyframes are color-independent, so they live in a single injected style block (the per-map
// accent glow is applied inline via sx). Mirrors the AiControlBadge approach.
const REVEAL_KEYFRAMES = `
@keyframes hocMapRevealPop {
    0% { transform: scale(0.6); opacity: 0; }
    60% { transform: scale(1.06); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}`;

// Persistent map indicator between the two armies: the word MAP plus the map's own thumbnail — the name
// itself only on hover, so the badge stays narrow and the armies sit close to it. Shows "?" until the
// server reveals the map (right before the L3 picks).
export const MapBadge: React.FC<{ mapType: number }> = ({ mapType }) => {
    const display = getMapDisplay(mapType);
    const accent = display?.accent ?? "rgba(255,255,255,0.7)";
    return (
        <Tooltip title={`Map type — ${display ? display.name : "?"}`} variant="soft">
            <Sheet
                variant="soft"
                sx={{
                    display: "grid",
                    placeItems: "center",
                    p: "6px",
                    minHeight: 62,
                    width: 62,
                    flex: "0 0 auto",
                    borderRadius: "14px",
                    bgcolor: "#171a23",
                    border: `1px solid ${display ? accent : "rgba(255,255,255,0.12)"}`,
                }}
            >
                {display ? (
                    <Box
                        component="img"
                        src={images[display.imageKey]}
                        alt={display.name}
                        sx={{ width: 48, height: 48, borderRadius: "8px", objectFit: "cover" }}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: "8px",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 26,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.7)",
                            bgcolor: "rgba(255,255,255,0.05)",
                        }}
                    >
                        ?
                    </Box>
                )}
            </Sheet>
        </Tooltip>
    );
};

// Blocking reveal shown ONCE when the map is first revealed (right before the L3 picks). Auto-dismisses
// after a few seconds; the acting player can dismiss instantly with Continue and pick straight away.
export const MapRevealModal: React.FC<{ mapType: number }> = ({ mapType }) => {
    const [open, setOpen] = useState(false);
    // The map value we've already announced — so the modal fires exactly once per reveal (and not again on
    // every subsequent SSE frame, which keeps re-sending the same map type).
    const [announced, setAnnounced] = useState(0);

    useEffect(() => {
        if (!mapType || mapType === announced) {
            return undefined;
        }
        setAnnounced(mapType);
        setOpen(true);
        const timer = setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [mapType, announced]);

    const display = getMapDisplay(mapType);
    if (!display) {
        return null;
    }

    return (
        <Modal open={open} onClose={() => setOpen(false)}>
            <ModalDialog
                sx={{
                    bgcolor: "rgba(8,10,18,0.98)",
                    border: `1px solid ${display.accent}66`,
                    color: "#e7e9f0",
                    borderRadius: "16px",
                    maxWidth: 420,
                    width: "92vw",
                    textAlign: "center",
                    alignItems: "center",
                    py: 3,
                    boxShadow: `0 0 46px ${display.accent}33`,
                }}
            >
                <style>{REVEAL_KEYFRAMES}</style>
                <Typography
                    level="body-xs"
                    sx={{ textTransform: "uppercase", letterSpacing: 4, opacity: 0.55, mb: 1.5 }}
                >
                    Map type
                </Typography>
                <Box
                    component="img"
                    src={images[display.imageKey]}
                    alt={display.name}
                    sx={{
                        width: 176,
                        height: 176,
                        objectFit: "cover",
                        borderRadius: "14px",
                        border: `2px solid ${display.accent}`,
                        boxShadow: `0 0 30px ${display.accent}66`,
                        animation: "hocMapRevealPop 0.55s ease-out",
                    }}
                />
                <Typography
                    sx={{
                        mt: 2,
                        fontSize: "2.6rem",
                        fontWeight: 800,
                        lineHeight: 1.05,
                        color: display.accent,
                        textShadow: `0 0 18px ${display.accent}66`,
                        animation: "hocMapRevealPop 0.55s ease-out",
                    }}
                >
                    {display.name}
                </Typography>
                <Typography level="body-sm" sx={{ mt: 1, opacity: 0.75, maxWidth: 320 }}>
                    {display.blurb}
                </Typography>
                <Button
                    variant="solid"
                    onClick={() => setOpen(false)}
                    sx={{
                        mt: 2.5,
                        px: 4,
                        bgcolor: display.accent,
                        color: "#0b0d16",
                        fontWeight: 700,
                        "&:hover": { bgcolor: display.accent, filter: "brightness(1.1)" },
                    }}
                >
                    Continue
                </Button>
            </ModalDialog>
        </Modal>
    );
};
