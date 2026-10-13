import { premiumSourceHref } from "./premiumSourceHref";
import { PremiumAnswer } from "./PremiumAnswer";
import { PremiumSearchMatchProvider, usePremiumSearchMatch } from "./PremiumSearchMatchContext";
import { premiumSearchMatchChanged, type PremiumSearchMatchVersion } from "./premiumSearchFreshness";
import { useAuthContext } from "../auth/context/auth_context";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, Button, IconButton, Input, Typography } from "@mui/joy";
import Popper from "@mui/material/Popper";
import { motion, useReducedMotion } from "framer-motion";
import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { deviceIdHeaders } from "../../api/deviceId";
import {
    fetchPremiumSearch,
    premiumSearchBody,
    premiumSearchGameId,
    readPremiumSearch,
    type PremiumSearchEvent,
    type PremiumSearchMessage,
} from "../../api/premium_search";
import type { PremiumEvidence } from "../../api/premium_client";
import { EvidenceText, usePremiumAdvisor } from "./PremiumAdvisor";
import { hocFontFamily, hocInputSx, hocPrimaryButtonSx } from "../hocTheme";

const SetAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const PREMIUM_SEARCH_HEIGHT_PX = 44;
const SetDockAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const DockVisibleContext = createContext(false);
const SearchVisibleContext = createContext(false);
const SetSearchVisibleContext = createContext<(visible: boolean) => void>(() => {});

/** True once Ask Premium has an answer surface. */
export const usePremiumSearchVisible = (): boolean => useContext(SearchVisibleContext);

/**
 * Search is available from menus, the placement panel and the sandbox setup row.
 * During a fight, Premium suggests actions directly on the board without a search prompt.
 */
export const PremiumSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [dockAnchor, setDockAnchor] = useState<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);
    return (
        <SetAnchorContext.Provider value={setAnchor}>
            <SetSearchVisibleContext.Provider value={setVisible}>
                <SearchVisibleContext.Provider value={visible}>
                    <PremiumSearchMatchProvider>
                        <SetDockAnchorContext.Provider value={setDockAnchor}>
                            <DockVisibleContext.Provider value={visible && !anchor}>
                                <PremiumSearch anchor={anchor ?? dockAnchor} compact={Boolean(anchor)} />
                                {children}
                            </DockVisibleContext.Provider>
                        </SetDockAnchorContext.Provider>
                    </PremiumSearchMatchProvider>
                </SearchVisibleContext.Provider>
            </SetSearchVisibleContext.Provider>
        </SetAnchorContext.Provider>
    );
};

/** Inline placement panels reserve space for search; the sandbox row anchors it beside Invite. */
export const PremiumSearchSlot: React.FC<{ inline?: boolean }> = ({ inline = false }) => {
    const setAnchor = useContext(SetAnchorContext);
    const visible = usePremiumSearchVisible();
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setAnchor(ref.current);
        return () => setAnchor(null);
    }, [setAnchor]);
    return (
        <div
            ref={ref}
            style={{
                position: inline ? "relative" : "absolute",
                right: inline ? undefined : "calc(100% + 12px)",
                bottom: inline ? undefined : 0,
                width: inline ? "min(132px, 100%)" : "126px",
                height: "35.2px",
                display: inline && !visible ? "none" : "flex",
                flexShrink: 0,
                alignSelf: inline ? "flex-start" : undefined,
                alignItems: "center",
                pointerEvents: "auto",
                zIndex: 2,
            }}
        />
    );
};

/** Search beside the social controls on menu screens. */
export const PremiumSearchDockSlot: React.FC = () => {
    const setAnchor = useContext(SetDockAnchorContext);
    const visible = useContext(DockVisibleContext);
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setAnchor(ref.current);
        return () => setAnchor(null);
    }, [setAnchor]);
    return (
        <Box
            ref={ref}
            sx={{
                position: "absolute",
                right: "calc(100% + 10px)",
                top: "50%",
                transform: "translateY(-50%)",
                width: 168,
                height: PREMIUM_SEARCH_HEIGHT_PX,
                display: visible ? "flex" : "none",
                alignItems: "center",
                pointerEvents: "auto",
                zIndex: 1400,
            }}
        />
    );
};

export const PremiumSearch: React.FC<{ anchor: HTMLDivElement | null; compact: boolean }> = ({ anchor, compact }) => {
    const setVisible = useContext(SetSearchVisibleContext);
    const { advice } = usePremiumAdvisor();
    const { user } = useAuthContext();
    const accountKey = user?.email || user?.username;
    const available = Boolean(advice);
    const location = useLocation();
    const matchVersion = usePremiumSearchMatch(premiumSearchGameId(location.pathname));
    const reduceMotion = useReducedMotion();
    const searchId = useId();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [contextLabel, setContextLabel] = useState("");
    const [evidence, setEvidence] = useState<PremiumEvidence[]>([]);
    const [sources, setSources] = useState<NonNullable<PremiumSearchEvent["items"]>>([]);
    const [history, setHistory] = useState<PremiumSearchMessage[]>([]);
    const [lastRequest, setLastRequest] = useState<{
        query: string;
        history: PremiumSearchMessage[];
        version?: PremiumSearchMatchVersion;
    }>();
    const matchChanged = premiumSearchMatchChanged(lastRequest?.version, matchVersion);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    useLayoutEffect(() => {
        setVisible(available);
        return () => setVisible(false);
    }, [available, setVisible]);
    useEffect(() => {
        setOpen(false);
    }, [location.pathname, anchor, available]);
    useLayoutEffect(() => {
        controller.current?.abort();
        controller.current = null;
        setBusy(false);
        setHistory([]);
        setQuestion("");
        setLastRequest(undefined);
        setStatus("");
        setContextLabel("");
        setAnswer("");
        setEvidence([]);
        setSources([]);
        setError("");
    }, [location.pathname, available, accountKey]);
    useEffect(() => {
        if (!open || !available) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown, true);
        };
    }, [open, available]);
    if (!available || !anchor) return null;
    const clearConversation = () => {
        setLastRequest(undefined);
        setHistory([]);
        setAnswer("");
        setQuestion("");
        setEvidence([]);
        setSources([]);
        setError("");
        setStatus("");
        setContextLabel("");
    };
    const stop = () => {
        controller.current?.abort();
        controller.current = null;
        setBusy(false);
        setStatus("Stopped. Any partial answer has not been added to the conversation.");
    };
    const ask = async (input = question, priorHistory = history) => {
        if (!input.trim() || busy) return;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setBusy(true);
        setStatus("Reading your question and match context…");
        setContextLabel("");
        setError("");
        setAnswer("");
        setEvidence([]);
        setSources([]);
        const query = input.trim();
        setLastRequest({ query, history: priorHistory, version: matchVersion });
        let completed = "";
        try {
            const response = await fetchPremiumSearch(
                premiumSearchBody(query, location.pathname, priorHistory),
                { Authorization: localStorage.getItem("accessToken") ?? "", ...deviceIdHeaders() },
                abort.signal,
            );
            completed = await readPremiumSearch(response, (kind, event) => {
                if (controller.current !== abort || abort.signal.aborted) return;
                if (kind === "meta") {
                    const scope =
                        event.context === "match"
                            ? `Match when asked${event.stage ? ` · ${event.stage === "board" ? "placement" : event.stage}` : ""}`
                            : "General tactical advice";
                    setContextLabel(scope);
                }
                if (kind === "status")
                    setStatus(
                        event.phase === "answering"
                            ? "Writing your plan…"
                            : "Checking mechanics and comparing options…",
                    );
                if (kind === "delta") {
                    completed += event.text ?? "";
                    setAnswer(completed);
                }
                if (kind === "reset") {
                    completed = "";
                    setAnswer("");
                }
                if (kind === "done") {
                    setAnswer(event.answer ?? completed);
                    setSources(event.sources ?? []);
                    setStatus("Answer ready.");
                }
                if (kind === "sources") setSources(event.items ?? []);
                if (kind === "premium_evidence" && event.packet)
                    setEvidence((previous) => [
                        ...previous.filter((item) => item.evidenceId !== event.packet!.evidenceId),
                        event.packet!,
                    ]);
            });
            if (controller.current !== abort || abort.signal.aborted) return;
            setHistory([
                ...priorHistory.slice(-4),
                { role: "user", content: query },
                { role: "assistant", content: completed },
            ]);
        } catch (failure) {
            if (controller.current === abort && !abort.signal.aborted) {
                setStatus("");
                setError(
                    failure instanceof Error && failure.name === "TimeoutError"
                        ? "Advice took too long. Please try again with a more specific question."
                        : failure instanceof Error
                          ? failure.message
                          : "Search failed.",
                );
            }
        } finally {
            if (controller.current === abort) setBusy(false);
        }
    };
    const button = (
        <Button
            ref={buttonRef}
            aria-label="Open Premium AI Search"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? searchId : undefined}
            variant="solid"
            size={compact ? "sm" : "lg"}
            startDecorator={
                <span aria-hidden style={{ fontSize: compact ? "0.625rem" : "0.8rem", lineHeight: 1 }}>
                    ◆
                </span>
            }
            onClick={() => setOpen((previous) => !previous)}
            sx={{
                bgcolor: "#7f3819",
                color: "#ffe0bf",
                border: "1px solid #d97d38",
                "&:hover": { bgcolor: "#a75023" },
                fontFamily: hocFontFamily,
                fontSize: compact ? "0.78rem" : "0.95rem",
                position: "relative",
                width: "100%",
                flexShrink: 0,
                zIndex: 1100,
                height: compact ? "35.2px" : `${PREMIUM_SEARCH_HEIGHT_PX}px`,
                minHeight: compact ? "35.2px" : `${PREMIUM_SEARCH_HEIGHT_PX}px`,
                lineHeight: 1,
                "--Button-gap": compact ? "4px" : "8px",
                px: compact ? 1 : 1.5,
                whiteSpace: "nowrap",
                cursor: "var(--hoc-cursor-interactive), pointer",
            }}
        >
            Ask Premium
        </Button>
    );
    const ui = (
        <>
            {button}
            <Popper
                open={open}
                anchorEl={buttonRef.current}
                placement="top-start"
                transition
                modifiers={[
                    { name: "offset", options: { offset: [0, 12] } },
                    { name: "preventOverflow", options: { padding: 12 } },
                ]}
                sx={{ zIndex: 1410 }}
            >
                {({ placement, TransitionProps }) => (
                    <Box
                        component={motion.div}
                        ref={panelRef}
                        id={searchId}
                        role="dialog"
                        aria-modal={false}
                        aria-labelledby={`${searchId}-title`}
                        initial={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.97 }}
                        animate={
                            TransitionProps?.in
                                ? { opacity: 1, y: 0, scale: 1 }
                                : { opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.97 }
                        }
                        transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: "easeOut" }}
                        onAnimationStart={() => {
                            if (TransitionProps?.in) TransitionProps.onEnter();
                        }}
                        onAnimationComplete={() => {
                            if (TransitionProps && !TransitionProps.in) TransitionProps.onExited();
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                        sx={{
                            position: "relative",
                            width: "min(380px, calc(100vw - 24px))",
                            boxSizing: "border-box",
                            p: 1.5,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            bgcolor: "#21160f",
                            color: "#efdfce",
                            border: "1px solid #a95e2e",
                            borderRadius: "14px",
                            boxShadow: "0 12px 36px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,224,191,.08)",
                            fontFamily: hocFontFamily,
                            transformOrigin: placement.startsWith("top") ? "bottom left" : "top left",
                            "&::after": {
                                content: '""',
                                position: "absolute",
                                left: 24,
                                ...(placement.startsWith("top") ? { bottom: -7 } : { top: -7 }),
                                width: 12,
                                height: 12,
                                bgcolor: "#21160f",
                                borderRight: "1px solid #a95e2e",
                                borderBottom: "1px solid #a95e2e",
                                transform: placement.startsWith("top") ? "rotate(45deg)" : "rotate(225deg)",
                            },
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Typography id={`${searchId}-title`} level="title-md" sx={{ color: "#f5a562" }}>
                                Premium AI Search
                            </Typography>
                            <IconButton
                                aria-label="Close Premium Search"
                                size="sm"
                                variant="plain"
                                onClick={() => {
                                    setOpen(false);
                                    buttonRef.current?.focus();
                                }}
                                sx={{ color: "#d5b698", "&:hover": { bgcolor: "#3b2417", color: "#ffe0bf" } }}
                            >
                                <CloseRoundedIcon fontSize="small" />
                            </IconButton>
                        </Box>
                        <Typography level="body-sm" sx={{ color: "#ceb399" }}>
                            {premiumSearchGameId(location.pathname)
                                ? "Get a plan for your current match, compare choices, or ask why a move helps."
                                : "Compare builds, counters and tradeoffs. Name your army and opponent for a specific plan."}
                        </Typography>
                        <Box
                            component="form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void ask();
                            }}
                            sx={{ display: "flex", gap: 1 }}
                        >
                            <Input
                                aria-label="Gameplay question"
                                placeholder="What should I do, and why?"
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                size="sm"
                                sx={{ ...hocInputSx, flex: 1, minWidth: 0 }}
                                slotProps={{ input: { maxLength: 600, autoFocus: true } }}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                disabled={busy || !question.trim()}
                                sx={{ ...hocPrimaryButtonSx, flexShrink: 0 }}
                            >
                                Ask
                            </Button>
                            {busy && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="plain"
                                    onClick={stop}
                                    sx={{ color: "#f6b87e" }}
                                >
                                    Stop
                                </Button>
                            )}
                        </Box>
                        {(contextLabel || lastRequest) && (
                            <Box
                                sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}
                            >
                                <Typography level="body-xs" sx={{ color: "#ceb399" }}>
                                    {contextLabel}
                                </Typography>
                                {lastRequest && (
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={busy}
                                        onClick={clearConversation}
                                        sx={{ color: "#f6b87e", minHeight: 24, fontSize: 11, p: 0.5 }}
                                    >
                                        New conversation
                                    </Button>
                                )}
                            </Box>
                        )}
                        {matchChanged && lastRequest && (
                            <Box sx={{ borderLeft: "2px solid #e18b48", pl: 1 }}>
                                <Typography level="body-xs" role="status" sx={{ color: "#f6bd8a" }}>
                                    The match changed since you asked. This advice may need updating.
                                </Typography>
                                <Button
                                    size="sm"
                                    variant="plain"
                                    disabled={busy}
                                    onClick={() => void ask(lastRequest.query, lastRequest.history)}
                                    sx={{ color: "#f6b87e", minHeight: 24, p: 0.5 }}
                                >
                                    Update for current match
                                </Button>
                            </Box>
                        )}
                        {(error || answer || busy || status || sources.length > 0 || evidence.length > 0) && (
                            <Box
                                sx={{
                                    maxHeight: "min(300px, max(80px, calc(100dvh - 280px)))",
                                    overflowY: "auto",
                                    overflowWrap: "anywhere",
                                    overscrollBehavior: "contain",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                    scrollbarWidth: "thin",
                                    scrollbarColor: "#84502f transparent",
                                }}
                            >
                                {error && (
                                    <Typography role="alert" sx={{ color: "#f6b287" }}>
                                        {error}
                                    </Typography>
                                )}
                                {status && (
                                    <Typography level="body-xs" role="status" sx={{ color: "#ceb399" }}>
                                        {status}
                                    </Typography>
                                )}
                                <Box aria-busy={busy} sx={{ lineHeight: 1.55, color: "#efdfce", fontSize: 13 }}>
                                    {answer ? <PremiumAnswer text={answer} /> : ""}
                                </Box>
                                {sources.length > 0 && (
                                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                                        {sources.map((source) => (
                                            <a
                                                key={source.id}
                                                href={premiumSourceHref(source.href)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: "#f6b87e", fontSize: 12 }}
                                            >
                                                {source.name}
                                            </a>
                                        ))}
                                    </Box>
                                )}
                                {evidence.map((packet) => (
                                    <Box
                                        component="details"
                                        key={packet.evidenceId}
                                        sx={{ p: 1, border: "1px solid #84502f", borderRadius: 6, fontSize: 12 }}
                                    >
                                        <summary>
                                            {packet.label ?? "Snapshot evidence"} · {packet.independentFamilies}{" "}
                                            families
                                        </summary>
                                        <EvidenceText evidence={packet} />
                                        <Typography level="body-xs" sx={{ overflowWrap: "anywhere", mt: 0.5 }}>
                                            {packet.evidenceId}
                                        </Typography>
                                        <Typography level="body-xs" sx={{ mt: 0.5 }}>
                                            {packet.caveat}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                )}
            </Popper>
        </>
    );
    return createPortal(ui, anchor);
};
