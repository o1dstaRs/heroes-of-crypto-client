import { Box, Button, Input, Modal, ModalDialog, Sheet, Stack, Typography } from "@mui/joy";
import React, { useEffect, useMemo, useState } from "react";

import { getFactionOf, ToFactionName, type CreatureId } from "@heroesofcrypto/common";

import { fetchRankedBan, setRankedBan } from "../api/social_client";
import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

/**
 * Pre-game ranked ban: the ONE unit this player never wants to see offered in their ranked drafts.
 * Stored server-side (both players' preferences must meet at match creation): same pick by both =
 * banned; only one side set = banned; different picks = a deterministic 50/50 — at most ONE extra
 * banned creature per game on top of the automatic bans.
 */

const ALL_CREATURES = Object.entries(UNIT_ID_TO_NAME)
    .map(([id, name]) => ({ id: Number(id), name, faction: ToFactionName[getFactionOf(Number(id) as CreatureId)] }))
    .filter((creature) => creature.id > 0 && creature.name !== "Unknown")
    .sort((a, b) => a.name.localeCompare(b.name));

// One column per faction (owner call). Alphabetical across all 63 creatures made the list a wall of names
// you had to read; by faction you can go straight to the roster you actually play against. Order matches the
// draft's own, with Death last since it is the smallest and never appears in the draft pool.
const FACTION_ORDER = ["Life", "Nature", "Chaos", "Might", "Death"] as const;

const FACTION_COLOR: Record<string, string> = {
    Life: "#e0d3b0",
    Nature: "#aebf92",
    Chaos: "#e0a06a",
    Might: "#9fb6d4",
    Death: "#b9a2c8",
};

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

    // Grouped, not flat: search still narrows the list, and a faction whose whole roster is filtered out
    // drops its column rather than leaving a labelled gap.
    const columns = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const matching = ALL_CREATURES.filter((creature) => creature.name.toLowerCase().includes(needle));
        return FACTION_ORDER.map((faction) => ({
            faction,
            creatures: matching.filter((creature) => creature.faction === faction),
        })).filter((column) => column.creatures.length > 0);
    }, [query]);

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
                        <CreaturePortraitImage
                            creatureId={creatureId}
                            alt=""
                            sx={{ width: 26, height: 26, borderRadius: 4 }}
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
                <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width: 880, maxWidth: "96vw" }}>
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
                            gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
                            alignItems: "start",
                            gap: 1,
                            maxHeight: "52vh",
                            overflowY: "auto",
                            mt: 0.5,
                            pr: 0.5,
                        }}
                    >
                        {columns.map(({ faction, creatures }) => (
                            <Box key={faction} sx={{ display: "grid", gap: 0.75, minWidth: 0 }}>
                                <Typography
                                    level="body-xs"
                                    sx={{
                                        color: FACTION_COLOR[faction],
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                        textAlign: "center",
                                        borderBottom: `1px solid ${FACTION_COLOR[faction]}55`,
                                        pb: 0.25,
                                        position: "sticky",
                                        top: 0,
                                        // The list scrolls, so the captions ride along at the top of their
                                        // column — otherwise you lose track of which roster you are in.
                                        bgcolor: "rgba(12,10,9,0.92)",
                                        zIndex: 1,
                                    }}
                                >
                                    {faction}
                                </Typography>
                                {creatures.map((creature) => (
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
                                            borderColor:
                                                creature.id === creatureId ? hocColors.danger : "rgba(255,143,0,0.25)",
                                            bgcolor:
                                                creature.id === creatureId ? "rgba(255,90,63,0.15)" : "rgba(0,0,0,0.3)",
                                            "&:hover": {
                                                borderColor: hocColors.danger,
                                                bgcolor: "rgba(255,90,63,0.12)",
                                            },
                                        }}
                                    >
                                        <CreaturePortraitImage
                                            creatureId={creature.id}
                                            alt=""
                                            sx={{ width: 52, height: 52, borderRadius: 6 }}
                                        />
                                        <Typography
                                            level="body-xs"
                                            sx={{ color: hocColors.parchment, textAlign: "center" }}
                                        >
                                            {creature.name}
                                        </Typography>
                                    </Sheet>
                                ))}
                            </Box>
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
