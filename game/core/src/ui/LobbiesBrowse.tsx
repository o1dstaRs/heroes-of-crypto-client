import { LobbyStatus, type LobbyObject } from "@heroesofcrypto/common";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Input,
    Modal,
    ModalDialog,
    Sheet,
    Stack,
    Switch,
    Typography,
} from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { createLobby, fetchPublicLobbies } from "../api/lobby_client";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

const POLL_INTERVAL_MS = 3000;

const statusLabel = (status: number | undefined): string => {
    switch (status) {
        case LobbyStatus.LOBBY_FULL:
            return "Full";
        case LobbyStatus.LOBBY_STARTING:
            return "Starting";
        case LobbyStatus.LOBBY_STARTED:
            return "In game";
        default:
            return "Open";
    }
};

export const LobbiesBrowse: React.FC = () => {
    const navigate = useNavigate();
    const [lobbies, setLobbies] = useState<LobbyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("");
    const [isPrivate, setIsPrivate] = useState(false);
    const [pin, setPin] = useState("");
    const [creating, setCreating] = useState(false);

    const mountedRef = useRef(true);

    const refresh = useCallback(async () => {
        try {
            const list = await fetchPublicLobbies();
            if (mountedRef.current) {
                setLobbies(list);
                setError("");
            }
        } catch {
            if (mountedRef.current) {
                setError("Failed to load lobbies");
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        const handle = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(handle);
        };
    }, [refresh]);

    const handleCreate = useCallback(async () => {
        if (isPrivate && !/^\d{4}$/.test(pin)) {
            setError("A private lobby needs a 4-digit PIN");
            return;
        }
        setCreating(true);
        try {
            const lobby = await createLobby({ name: name.trim(), isPrivate, pin: isPrivate ? pin : "" });
            navigate(`/lobby/${lobby.id}`);
        } catch {
            setError("Failed to create lobby");
            setCreating(false);
        }
    }, [name, isPrivate, pin, navigate]);

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: hocColors.black, p: 3, display: "flex", justifyContent: "center" }}>
            <Stack spacing={2} sx={{ width: "100%", maxWidth: 720 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="h2" sx={{ color: hocColors.parchment }}>
                        Open lobbies
                    </Typography>
                    <Button sx={hocPrimaryButtonSx} onClick={() => setCreateOpen(true)}>
                        Create lobby
                    </Button>
                </Stack>

                {error ? <Alert color="danger">{error}</Alert> : null}

                {loading ? (
                    <Stack alignItems="center" sx={{ py: 6 }}>
                        <CircularProgress />
                    </Stack>
                ) : lobbies.length === 0 ? (
                    <Sheet sx={{ ...hocPanelSx, p: 4, textAlign: "center" }}>
                        <Typography sx={{ color: hocColors.parchment }}>
                            No open lobbies yet. Create one and share the link!
                        </Typography>
                    </Sheet>
                ) : (
                    lobbies.map((lobby) => (
                        <Sheet key={lobby.id} sx={{ ...hocPanelSx, p: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography level="title-md" sx={{ color: hocColors.parchment }}>
                                        {lobby.name || `${lobby.host?.username ?? "Player"}'s lobby`}
                                    </Typography>
                                    <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                                        Host: {lobby.host?.username ?? "Player"} · {lobby.host?.league ?? "Unranked"} ·{" "}
                                        {lobby.host?.rating ?? 0} · {statusLabel(lobby.status)}
                                    </Typography>
                                </Box>
                                <Button
                                    sx={hocSoftButtonSx}
                                    disabled={lobby.status !== LobbyStatus.LOBBY_OPEN}
                                    onClick={() => navigate(`/lobby/${lobby.id}`)}
                                >
                                    Join
                                </Button>
                            </Stack>
                        </Sheet>
                    ))
                )}
            </Stack>

            <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)}>
                <ModalDialog sx={hocPanelSx}>
                    <Typography level="h3" sx={{ color: hocColors.parchment }}>
                        Create a lobby
                    </Typography>
                    <Stack spacing={2} sx={{ mt: 2, minWidth: 320 }}>
                        <Input
                            placeholder="Lobby name (optional)"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 64))}
                        />
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Switch checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                            <Typography sx={{ color: hocColors.parchment }}>Private (join by link + PIN)</Typography>
                        </Stack>
                        {isPrivate ? (
                            <Input
                                placeholder="4-digit PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                slotProps={{ input: { inputMode: "numeric", maxLength: 4 } }}
                            />
                        ) : null}
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button
                                variant="plain"
                                disabled={creating}
                                onClick={() => setCreateOpen(false)}
                                sx={hocSoftButtonSx}
                            >
                                Cancel
                            </Button>
                            <Button sx={hocPrimaryButtonSx} loading={creating} onClick={() => void handleCreate()}>
                                Create
                            </Button>
                        </Stack>
                    </Stack>
                </ModalDialog>
            </Modal>
        </Box>
    );
};
