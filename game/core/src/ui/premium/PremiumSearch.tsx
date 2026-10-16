import { premiumSourceHref } from "./premiumSourceHref";
import { PremiumAnswer } from "./PremiumAnswer";
import { PremiumSearchMatchProvider, usePremiumSearchMatch } from "./PremiumSearchMatchContext";
import { premiumSearchMatchChanged, type PremiumSearchMatchVersion } from "./premiumSearchFreshness";
import { PremiumSearchPromptContext } from "./PremiumSearchPromptContext";
import { premiumQuestions } from "./premiumQuestions";
import { useAuthContext } from "../auth/context/auth_context";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, IconButton, Input, Typography } from "@mui/joy";
import Popper from "@mui/material/Popper";
import { motion, useReducedMotion } from "framer-motion";
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
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
import { EvidenceText } from "./PremiumEvidenceText";
import { PremiumAccessProvider, usePremiumAccess } from "./PremiumAccess";
import { usePremiumCapability } from "./usePremiumPreference";
import { hocFontFamily, hocInputSx } from "../hocTheme";
import { PremiumIcon } from "../PremiumIcon";
import { PremiumButton } from "./PremiumButton";

const SetAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const PREMIUM_SEARCH_HEIGHT_PX = 44;
const SetDockAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const DockVisibleContext = createContext(false);
const SearchVisibleContext = createContext(false);
const SetSearchVisibleContext = createContext<(visible: boolean) => void>(() => {});

interface PremiumSearchPrompt {
    question: string;
    pathname: string;
    accountKey?: string;
}

/** True once Ask Premium has an answer surface. */
export const usePremiumSearchVisible = (): boolean => useContext(SearchVisibleContext);

/**
 * Search is available from menus, draft, setup, placement and the bottom-right fight footer.
 * The fight's suggested-moves preference controls board drawings independently of chat.
 */
export const PremiumSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [dockAnchor, setDockAnchor] = useState<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [prompt, setPrompt] = useState<PremiumSearchPrompt>();
    const { pathname } = useLocation();
    const { user } = useAuthContext();
    const accountKey = user?.email || user?.username;
    const prefill = useCallback(
        (question: string) => setPrompt({ question, pathname, accountKey }),
        [pathname, accountKey],
    );
    useLayoutEffect(() => setPrompt(undefined), [pathname, accountKey, visible]);
    return (
        <PremiumAccessProvider>
            <SetAnchorContext.Provider value={setAnchor}>
                <SetSearchVisibleContext.Provider value={setVisible}>
                    <SearchVisibleContext.Provider value={visible}>
                        <PremiumSearchMatchProvider>
                            <SetDockAnchorContext.Provider value={setDockAnchor}>
                                <DockVisibleContext.Provider value={visible && !anchor}>
                                    <PremiumSearchPromptContext.Provider
                                        value={visible && premiumSearchGameId(pathname) ? prefill : undefined}
                                    >
                                        <PremiumSearch
                                            anchor={anchor ?? dockAnchor}
                                            compact={Boolean(anchor) || pathname.startsWith("/game/")}
                                            prompt={prompt}
                                        />
                                        {children}
                                    </PremiumSearchPromptContext.Provider>
                                </DockVisibleContext.Provider>
                            </SetDockAnchorContext.Provider>
                        </PremiumSearchMatchProvider>
                    </SearchVisibleContext.Provider>
                </SetSearchVisibleContext.Provider>
            </SetAnchorContext.Provider>
        </PremiumAccessProvider>
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
                containerType: "inline-size",
                display: inline && !visible ? "none" : "flex",
                flexShrink: 0,
                alignSelf: inline ? "flex-start" : undefined,
                alignItems: "flex-end",
                pointerEvents: "auto",
                zIndex: 2,
            }}
        />
    );
};

/** Search beside menu controls or above the in-game system controls. */
export const PremiumSearchDockSlot: React.FC<{ compact?: boolean; inline?: boolean }> = ({
    compact = false,
    inline = false,
}) => {
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
                position: inline ? "relative" : "absolute",
                right: inline ? undefined : "calc(100% + 10px)",
                top: inline ? undefined : "50%",
                transform: inline ? undefined : "translateY(-50%)",
                width: compact ? 132 : 168,
                height: compact ? 35.2 : PREMIUM_SEARCH_HEIGHT_PX,
                containerType: "inline-size",
                display: visible ? "flex" : "none",
                alignItems: "center",
                pointerEvents: "auto",
                zIndex: 1400,
            }}
        />
    );
};

export const PremiumSearch: React.FC<{
    anchor: HTMLDivElement | null;
    compact: boolean;
    prompt?: PremiumSearchPrompt;
}> = ({ anchor, compact, prompt }) => {
    const setVisible = useContext(SetSearchVisibleContext);
    const access = usePremiumAccess();
    const chatEnabled = usePremiumCapability("chat");
    const { user } = useAuthContext();
    const accountKey = user?.email || user?.username;
    const available = Boolean(access?.active) && chatEnabled;
    const location = useLocation();
    const gameId = premiumSearchGameId(location.pathname);
    const matchVersion = usePremiumSearchMatch(gameId);
    const suggestions = premiumQuestions(Boolean(gameId), matchVersion?.stage);
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
    const handledPrompt = useRef<PremiumSearchPrompt | undefined>(undefined);
    const clearConversation = useCallback(() => {
        setLastRequest(undefined);
        setHistory([]);
        setAnswer("");
        setQuestion("");
        setEvidence([]);
        setSources([]);
        setError("");
        setStatus("");
        setContextLabel("");
    }, []);
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
        clearConversation();
    }, [location.pathname, available, accountKey, clearConversation]);
    useEffect(() => {
        if (
            !available ||
            !anchor ||
            !prompt ||
            handledPrompt.current === prompt ||
            prompt.pathname !== location.pathname ||
            prompt.accountKey !== accountKey
        )
            return;
        handledPrompt.current = prompt;
        controller.current?.abort();
        controller.current = null;
        setBusy(false);
        clearConversation();
        setQuestion(prompt.question);
        setOpen(true);
    }, [prompt, available, anchor, location.pathname, accountKey, clearConversation]);
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
        <PremiumButton
            ref={buttonRef}
            aria-label="Open Premium AI Search"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? searchId : undefined}
            variant="solid"
            size={compact ? "sm" : "lg"}
            startDecorator={<PremiumIcon size={compact ? "min(1rem, 12.7cqw)" : 20} />}
            onClick={() => setOpen((previous) => !previous)}
            sx={{
                fontFamily: hocFontFamily,
                fontSize: compact ? "min(0.78rem, 9.9cqw)" : "0.95rem",
                position: "relative",
                width: "100%",
                minWidth: 0,
                flexShrink: 0,
                zIndex: 1100,
                height: compact ? "clamp(30px, 27.94cqw, 35.2px)" : `${PREMIUM_SEARCH_HEIGHT_PX}px`,
                minHeight: compact ? "clamp(30px, 27.94cqw, 35.2px)" : `${PREMIUM_SEARCH_HEIGHT_PX}px`,
                lineHeight: 1,
                "--Button-gap": compact ? "4px" : "8px",
                px: compact ? "min(8px, 6.35cqw)" : 1.5,
                whiteSpace: "nowrap",
                cursor: "var(--hoc-cursor-interactive), pointer",
            }}
        >
            Ask Premium
        </PremiumButton>
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
                            <Typography
                                id={`${searchId}-title`}
                                level="title-md"
                                startDecorator={<PremiumIcon />}
                                sx={{ color: "var(--hoc-premium-accent)" }}
                            >
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
                            {gameId
                                ? "Get a plan for your current match, compare choices, or ask why a move helps."
                                : "Compare builds, counters and tradeoffs. Name your army and opponent for a specific plan."}
                        </Typography>
                        {!lastRequest && (
                            <Box
                                role="group"
                                aria-label="Suggested Premium questions"
                                sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
                            >
                                {suggestions.map((suggestion) => (
                                    <PremiumButton
                                        key={suggestion.label}
                                        size="sm"
                                        variant="outlined"
                                        startDecorator={null}
                                        title={suggestion.question}
                                        disabled={busy}
                                        onClick={() => {
                                            setQuestion(suggestion.question);
                                            void ask(suggestion.question, []);
                                        }}
                                        sx={{ minHeight: 28, px: 0.8, fontSize: 11 }}
                                    >
                                        {suggestion.label}
                                    </PremiumButton>
                                ))}
                            </Box>
                        )}
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
                                slotProps={{ input: { maxLength: 600, autoFocus: true, title: question || undefined } }}
                            />
                            <PremiumButton
                                type="submit"
                                size="sm"
                                disabled={busy || !question.trim()}
                                sx={{ flexShrink: 0 }}
                            >
                                Ask
                            </PremiumButton>
                            {busy && (
                                <PremiumButton type="button" size="sm" variant="plain" onClick={stop}>
                                    Stop
                                </PremiumButton>
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
                                    <PremiumButton
                                        size="sm"
                                        variant="plain"
                                        disabled={busy}
                                        onClick={clearConversation}
                                        sx={{ minHeight: 24, fontSize: 11, p: 0.5 }}
                                    >
                                        New conversation
                                    </PremiumButton>
                                )}
                            </Box>
                        )}
                        {matchChanged && lastRequest && (
                            <Box sx={{ borderLeft: "2px solid #e18b48", pl: 1 }}>
                                <Typography level="body-xs" role="status" sx={{ color: "#f6bd8a" }}>
                                    The match changed since you asked. This advice may need updating.
                                </Typography>
                                <PremiumButton
                                    size="sm"
                                    variant="plain"
                                    disabled={busy}
                                    onClick={() => void ask(lastRequest.query, lastRequest.history)}
                                    sx={{ minHeight: 24, p: 0.5 }}
                                >
                                    Update for current match
                                </PremiumButton>
                            </Box>
                        )}
                        {(error || answer || busy || status || sources.length > 0 || evidence.length > 0) && (
                            <Box
                                sx={{
                                    maxHeight: "min(300px, max(80px, calc(100dvh - 310px)))",
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
                                {lastRequest && (
                                    <Typography level="body-xs" sx={{ color: "#d9b99b" }}>
                                        <strong>You asked:</strong> {lastRequest.query}
                                    </Typography>
                                )}
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
