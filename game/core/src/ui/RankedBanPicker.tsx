import { Box, Button, Input, Modal, ModalDialog, Sheet, Stack, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { fetchRankedBan, setRankedBan } from "../api/social_client";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";
import { resolveUnitImage } from "./unitImage";

/**
 * Pre-game ranked ban: the ONE unit this player never wants to see offered in their ranked drafts.
 * Stored server-side (both players' preferences must meet at match creation): same pick by both =
 * banned; only one side set = banned; different picks = a deterministic 50/50 — at most ONE extra
 * banned creature per game on top of the automatic bans.
 */

const ALL_CREATURES = Object.entries(UNIT_ID_TO_NAME)
    .map(([id, name]) => ({ id: Number(id), name }))
    .filter((creature) => creature.id > 0 && creature.name !== "Unknown")
    .sort((a, b) => a.name.localeCompare(b.name));

export const RankedBanPicker: React.FC = () => {
    const [creatureId, setCreatureId] = useState(0);
    const [creatureName, setCreatureName] = useState("");
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void fetchRankedBan()
            .then((ban) => {
                if (!cancelled) {
                    setCreatureId(ban.creatureId);
                    setCreatureName(ban.creatureName || UNIT_ID_TO_NAME[ban.creatureId] || "");
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const choose = async (id: number): Promise<void> => {
        if (busy) return;
        setBusy(true);
        try {
            const saved = await setRankedBan(id);
            setCreatureId(saved.creatureId);
            setCreatureName(saved.creatureName || UNIT_ID_TO_NAME[saved.creatureId] || "");
            setOpen(false);
        } catch {
            /* keep the previous state; the lobby is not a place for hard errors */
        } finally {
            setBusy(false);
        }
    };

    const filtered = useMemo(
        () => ALL_CREATURES.filter((creature) => creature.name.toLowerCase().includes(query.trim().toLowerCase())),
        [query],
    );

    return (
        <>
            <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="center"
                sx={{ width: "100%", maxWidth: 650, mt: 1.25 }}
            >
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    Ban a unit from your drafts:
                </Typography>
                {creatureId > 0 ? (
                    <Sheet
                        variant="outlined"
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            px: 1,
                            py: 0.4,
                            borderRadius: "md",
                            borderColor: "rgba(255,90,63,0.55)",
                            bgcolor: "rgba(255,90,63,0.12)",
                        }}
                    >
                        <img
                            src={resolveUnitImage(undefined, creatureName)}
                            alt=""
                            width={26}
                            height={26}
                            style={{ borderRadius: 4, objectFit: "cover" }}
                        />
                        <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                            {creatureName}
                        </Typography>
                    </Sheet>
                ) : (
                    <Typography level="body-sm" sx={{ color: hocColors.parchment, opacity: 0.7 }}>
                        none
                    </Typography>
                )}
                <Button size="sm" variant="outlined" sx={hocSoftButtonSx} onClick={() => setOpen(true)}>
                    {creatureId > 0 ? "Change" : "Choose"}
                </Button>
                {creatureId > 0 ? (
                    <Button
                        size="sm"
                        variant="plain"
                        sx={{ color: hocColors.muted }}
                        disabled={busy}
                        onClick={() => void choose(0)}
                    >
                        Clear
                    </Button>
                ) : null}
            </Stack>

            <Modal open={open} onClose={() => setOpen(false)}>
                <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width: 560, maxWidth: "96vw" }}>
                    <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                        Ban one unit
                    </Typography>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        It will never be offered in your ranked drafts. If your opponent bans a different unit, one of
                        the two is chosen 50/50 — only one extra ban applies per game.
                    </Typography>
                    <Input
                        size="sm"
                        placeholder="Search units…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        sx={{ ...hocInputSx, mt: 0.5 }}
                    />
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                            gap: 0.75,
                            maxHeight: "52vh",
                            overflowY: "auto",
                            mt: 0.5,
                            pr: 0.5,
                        }}
                    >
                        {filtered.map((creature) => (
                            <Sheet
                                key={creature.id}
                                variant="outlined"
                                onClick={() => void choose(creature.id)}
                                sx={{
                                    cursor: "pointer",
                                    p: 0.75,
                                    borderRadius: "md",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 0.5,
                                    borderColor: creature.id === creatureId ? hocColors.danger : "rgba(255,143,0,0.25)",
                                    bgcolor: creature.id === creatureId ? "rgba(255,90,63,0.15)" : "rgba(0,0,0,0.3)",
                                    "&:hover": { borderColor: hocColors.danger, bgcolor: "rgba(255,90,63,0.12)" },
                                }}
                            >
                                <img
                                    src={resolveUnitImage(undefined, creature.name)}
                                    alt=""
                                    width={52}
                                    height={52}
                                    style={{ borderRadius: 6, objectFit: "cover" }}
                                    loading="lazy"
                                />
                                <Typography level="body-xs" sx={{ color: hocColors.parchment, textAlign: "center" }}>
                                    {creature.name}
                                </Typography>
                            </Sheet>
                        ))}
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Button variant="outlined" sx={hocSoftButtonSx} onClick={() => setOpen(false)}>
                            Close
                        </Button>
                        {creatureId > 0 ? (
                            <Button
                                variant="solid"
                                sx={hocPrimaryButtonSx}
                                disabled={busy}
                                onClick={() => void choose(0)}
                            >
                                Remove my ban
                            </Button>
                        ) : null}
                    </Stack>
                </ModalDialog>
            </Modal>
        </>
    );
};
