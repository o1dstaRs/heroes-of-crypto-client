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

import {
    createLobby,
    fetchLobbyPriceBreakdown,
    fetchPublicLobbies,
    type LobbyPriceBreakdown,
} from "../api/lobby_client";
import { socialErrorMessage } from "../api/social_client";
import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { useRankedStanding } from "./PlayerPortal/useRankedStanding";

const POLL_INTERVAL_MS = 3000;

export const lobbyStatusLabel = (status: number | undefined): string => {
    switch (status) {
        case LobbyStatus.LOBBY_FULL:
            return t("Full");
        case LobbyStatus.LOBBY_STARTING:
            return t("Starting");
        case LobbyStatus.LOBBY_STARTED:
            return t("In game");
        default:
            return t("Open");
    }
};

export interface PublicLobbiesPanelProps {
    /** Compact rows for the arena column; the standalone browse screen uses the roomier default. */
    dense?: boolean;
    /**
     * Draw inside a panel box of its own. The arena stacks several unrelated blocks in one column, so
     * the lobbies need a visible container to read as their own thing rather than more queue chrome;
     * the standalone browse page already IS the box and passes this off.
     */
    boxed?: boolean;
    /**
     * Render nothing at all when there is nothing to show.
     *
     * For the arena: an empty box that says "no open lobbies" is column space spent on absence. Only
     * safe where another route to lobbies survives — the arena keeps its browse button, which reaches
     * the standalone page and its create control.
     */
    hideWhenEmpty?: boolean;
    /**
     * Drop the create control (and the pricing chatter that only exists to explain its cost).
     *
     * The arena shows this list purely as "somebody is already waiting" — creating a lobby is a
     * different intent that belongs on the browse screen its button already leads to. Only safe
     * where such a route survives; the standalone screen must never pass this.
     */
    hideCreate?: boolean;
}

/**
 * The live list of open public lobbies, plus the control that opens one.
 *
 * Shared by the Ranked Arena (rendered inline under the queue buttons, so a player who does not want
 * the ranked queue can see there is a human waiting without navigating away) and by the standalone
 * browse screen. One component so the two can never drift into showing different things.
 *
 * Creating is NOT free: the host is charged ceil(season human gold / 1000) and never refunded, so the
 * price is quoted on the button and inside the dialog rather than sprung as an error after the click.
 */
export const PublicLobbiesPanel: React.FC<PublicLobbiesPanelProps> = ({
    dense = false,
    boxed = false,
    hideWhenEmpty = false,
    hideCreate = false,
}) => {
    const navigate = useNavigate();
    useTranslation();
    // The purse, so the button can refuse before the server has to. Null while it loads (or if the
    // call fails), which simply means no client-side guard — the server still rejects with its price.
    const purse = useRankedStanding()?.gold;
    const [lobbies, setLobbies] = useState<LobbyObject[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [quote, setQuote] = useState<LobbyPriceBreakdown | undefined>(undefined);

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
                setError(t("Failed to load lobbies"));
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);

    // The price moves with the whole season's gold, not with this screen, so it is read once on mount
    // and again after a successful create (the fee just burned, shrinking the pool it is derived from).
    const refreshPrice = useCallback(async () => {
        try {
            const next = await fetchLobbyPriceBreakdown();
            if (mountedRef.current) {
                setQuote(next);
            }
        } catch {
            // Leave it undefined: the dialog then simply omits the quote rather than claiming "free".
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        void refreshPrice();
        const handle = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(handle);
        };
    }, [refresh, refreshPrice]);

    const price = quote?.price;
    const tooPoor = price !== undefined && purse !== undefined && purse < price;

    // The charge moves on its own as the season mints gold and calibrates players, so state the
    // arithmetic rather than a bare number — an unexplained price that changes reads as arbitrary.
    const priceExplanation = ((): string => {
        if (!quote) {
            return "";
        }
        if (quote.price <= 0) {
            return t("Lobbies are free until the season has minted gold and calibrated its first players.");
        }
        return (
            `${t("The season holds")} ${quote.seasonGold.toLocaleString()} G ${t("across")} ` +
            `${quote.calibratedPlayers.toLocaleString()} ${t("calibrated players")} — ` +
            `${t("that gold spread over")} ${quote.perCalibratedPlayer} ${t(
                "slots each sets the price. It is charged to the host and never returned; whatever you put on the game itself is separate.",
            )}`
        );
    })();

    const handleCreate = useCallback(async () => {
        if (isPrivate && !/^\d{4}$/.test(pin)) {
            setError(t("A private lobby needs a 4-digit PIN"));
            return;
        }
        setCreating(true);
        try {
            const lobby = await createLobby({ name: name.trim(), isPrivate, pin: isPrivate ? pin : "" });
            navigate(`/lobby/${lobby.id}`);
        } catch (err) {
            // Surface the server's own wording — "Opening a lobby costs 42 gold this season — you do
            // not have enough" tells the player what to do; "Failed to create lobby" does not.
            setError(socialErrorMessage(err, t("Failed to create lobby")));
            setCreating(false);
            void refreshPrice();
        }
    }, [name, isPrivate, pin, navigate, refreshPrice]);

    const priceNote =
        price === undefined
            ? ""
            : price <= 0
              ? t("Free while the season has minted no gold")
              : `${price} G · ${t("non-refundable")}`;

    // Nothing to show and the caller does not want the empty state: disappear entirely, including the
    // box. Deliberately NOT hidden while still loading or after an error — flashing in on every poll,
    // or swallowing "failed to load lobbies", would both read as a broken panel rather than an empty one.
    if (hideWhenEmpty && !loading && !error && lobbies.length === 0) {
        return null;
    }

    const body = (
        <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography level="title-md" sx={{ color: hocColors.sidebarTitle }}>
                    {`${t("Open lobbies")}${lobbies.length ? ` (${lobbies.length})` : ""}`}
                </Typography>
                {hideCreate ? null : (
                    <Stack direction="row" alignItems="center" spacing={1}>
                        {priceNote ? (
                            <Typography level="body-xs" sx={{ color: hocColors.muted, whiteSpace: "nowrap" }}>
                                {priceNote}
                            </Typography>
                        ) : null}
                        <Button
                            size="sm"
                            sx={{ ...hocPrimaryButtonSx, flexShrink: 0 }}
                            disabled={tooPoor}
                            onClick={() => setCreateOpen(true)}
                        >
                            {t("Create lobby")}
                        </Button>
                    </Stack>
                )}
            </Stack>

            {priceExplanation && !hideCreate ? (
                <Typography level="body-xs" sx={{ color: hocColors.muted, lineHeight: 1.45 }}>
                    {priceExplanation}
                </Typography>
            ) : null}

            {tooPoor && !hideCreate ? (
                <Typography level="body-xs" sx={{ color: hocColors.danger }}>
                    {`${t("Opening a lobby costs")} ${price} G — ${t("your purse holds")} ${purse} G`}
                </Typography>
            ) : null}

            {error ? <Alert sx={{ ...hocPanelSx, borderColor: hocColors.danger }}>{error}</Alert> : null}

            {loading ? (
                <Stack alignItems="center" sx={{ py: dense ? 2 : 6 }}>
                    <CircularProgress size="sm" />
                </Stack>
            ) : lobbies.length === 0 ? (
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    {hideCreate
                        ? t("No open lobbies right now.")
                        : t("No open lobbies right now — open one and invite a friend.")}
                </Typography>
            ) : (
                <Stack spacing={dense ? 0.75 : 2} sx={dense ? { maxHeight: 260, overflowY: "auto", pr: 0.5 } : {}}>
                    {lobbies.map((lobby) => (
                        <Sheet
                            key={lobby.id}
                            sx={{
                                ...hocPanelSx,
                                p: dense ? 1 : 2,
                                borderRadius: "8px",
                                // Inside the dense arena box these rows are already nested two deep;
                                // a drop shadow per row turns a list into a stack of cards.
                                ...(dense ? { boxShadow: "none", bgcolor: "rgba(255,255,255,0.035)" } : {}),
                            }}
                        >
                            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography
                                        level={dense ? "body-sm" : "title-md"}
                                        noWrap
                                        sx={{ color: hocColors.parchment }}
                                    >
                                        {lobby.name || `${lobby.host?.username ?? t("Player")}'s lobby`}
                                    </Typography>
                                    <Typography level="body-xs" noWrap sx={{ color: hocColors.muted }}>
                                        {`${lobby.host?.username ?? t("Player")} · ${
                                            lobby.host?.league ?? "Unranked"
                                        } · ${lobbyStatusLabel(lobby.status)}`}
                                    </Typography>
                                </Box>
                                <Button
                                    size="sm"
                                    sx={{ ...hocSoftButtonSx, flexShrink: 0 }}
                                    disabled={lobby.status !== LobbyStatus.LOBBY_OPEN}
                                    onClick={() => navigate(`/lobby/${lobby.id}`)}
                                >
                                    {t("Join")}
                                </Button>
                            </Stack>
                        </Sheet>
                    ))}
                </Stack>
            )}

            {hideCreate ? null : (
                <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)}>
                    <ModalDialog sx={hocPanelSx}>
                        <Typography level="h3" sx={{ color: hocColors.parchment }}>
                            {t("Create a lobby")}
                        </Typography>
                        {priceExplanation ? (
                            <Typography level="body-sm" sx={{ color: hocColors.muted, mt: 0.5, lineHeight: 1.45 }}>
                                {price !== undefined && price > 0
                                    ? `${t("Opening a lobby costs")} ${price} G. ${priceExplanation}`
                                    : priceExplanation}
                            </Typography>
                        ) : null}
                        <Stack spacing={2} sx={{ mt: 2, minWidth: 320 }}>
                            <Input
                                placeholder={t("Lobby name (optional)")}
                                value={name}
                                onChange={(e) => setName(e.target.value.slice(0, 64))}
                            />
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Switch checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                                <Typography sx={{ color: hocColors.parchment }}>
                                    {t("Private (join by link + PIN)")}
                                </Typography>
                            </Stack>
                            {isPrivate ? (
                                <Input
                                    placeholder={t("4-digit PIN")}
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
                                    {t("Cancel")}
                                </Button>
                                <Button
                                    sx={hocPrimaryButtonSx}
                                    loading={creating}
                                    disabled={tooPoor}
                                    onClick={() => void handleCreate()}
                                >
                                    {price !== undefined && price > 0 ? `${t("Create")} · ${price} G` : t("Create")}
                                </Button>
                            </Stack>
                        </Stack>
                    </ModalDialog>
                </Modal>
            )}
        </>
    );

    if (!boxed) {
        return body;
    }
    return (
        <Sheet
            variant="plain"
            sx={{
                p: dense ? 1.25 : 2,
                borderRadius: "12px",
                // Still its own region, but a tint rather than an outlined card — inside the arena
                // card an extra border reads as a frame in a frame.
                border: "none",
                boxShadow: "none",
                bgcolor: "rgba(12,8,5,0.55)",
                color: hocColors.parchment,
            }}
        >
            <Stack spacing={dense ? 0.75 : 1.25}>{body}</Stack>
        </Sheet>
    );
};
