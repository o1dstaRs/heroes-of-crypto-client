import { PremiumAnswer } from "./PremiumAnswer";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, Button, IconButton, Input, Typography } from "@mui/joy";
import Popper from "@mui/material/Popper";
import { motion, useReducedMotion } from "framer-motion";
import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { deviceIdHeaders } from "../../api/deviceId";
import { knowledgeAiAskUrl } from "../../api/knowledge_ai";
import type { PremiumEvidence } from "../../api/premium_client";
import { EvidenceText, usePremiumAdvisor } from "./PremiumAdvisor";
import { hocFontFamily, hocInputSx } from "../hocTheme";

const SetAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const SearchVisibleContext = createContext(false);
const SetSearchVisibleContext = createContext<(visible: boolean) => void>(() => {});
const SuppressCornerContext = createContext<(suppress: boolean) => void>(() => {});

/** True once Ask Premium has an answer surface. The sandbox footer keeps its row from this. */
export const usePremiumSearchVisible = (): boolean => useContext(SearchVisibleContext);

/**
 * One search button for the app. The sandbox slot claims it, before the fight and after it starts.
 * Every other screen keeps the corner button.
 */
export const PremiumSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [suppressCorner, setSuppressCorner] = useState(false);
    return (
        <SetAnchorContext.Provider value={setAnchor}>
            <SetSearchVisibleContext.Provider value={setVisible}>
                <SuppressCornerContext.Provider value={setSuppressCorner}>
                    <SearchVisibleContext.Provider value={visible}>
                        <PremiumSearch anchor={anchor} suppressCorner={suppressCorner} />
                        {children}
                    </SearchVisibleContext.Provider>
                </SuppressCornerContext.Provider>
            </SetSearchVisibleContext.Provider>
        </SetAnchorContext.Provider>
    );
};

/** Sandbox setup and the fight that follows. The corner button stays off this scene. */
export const PremiumSearchGameSurface: React.FC = () => {
    const setSuppressCorner = useContext(SuppressCornerContext);
    useLayoutEffect(() => {
        setSuppressCorner(true);
        return () => setSuppressCorner(false);
    }, [setSuppressCorner]);
    return null;
};

/** Immediately left of the invite plate. Claiming this anchor takes the button off the corner. */
export const PremiumSearchSlot: React.FC = () => {
    const setAnchor = useContext(SetAnchorContext);
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setAnchor(ref.current);
        return () => setAnchor(null);
    }, [setAnchor]);
    return (
        <div
            ref={ref}
            style={{
                position: "absolute",
                right: "calc(100% + 8px)",
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                pointerEvents: "auto",
                zIndex: 2,
            }}
        />
    );
};

interface SearchEvent {
    text?: string;
    answer?: string;
    message?: string;
    items?: { id: string; name: string; href: string }[];
    sources?: { id: string; name: string; href: string }[];
    packet?: PremiumEvidence;
}

export const PremiumSearch: React.FC<{ anchor: HTMLDivElement | null; suppressCorner: boolean }> = ({
    anchor,
    suppressCorner,
}) => {
    const setVisible = useContext(SetSearchVisibleContext);
    const { advice } = usePremiumAdvisor();
    const available = Boolean(advice);
    const location = useLocation();
    const reduceMotion = useReducedMotion();
    const searchId = useId();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [evidence, setEvidence] = useState<PremiumEvidence[]>([]);
    const [sources, setSources] = useState<NonNullable<SearchEvent["items"]>>([]);
    const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    useLayoutEffect(() => {
        setVisible(available);
        return () => setVisible(false);
    }, [available, setVisible]);
    useEffect(() => {
        setOpen(false);
    }, [location.pathname, anchor, available]);
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
    if (!available || (!anchor && suppressCorner)) return null;
    const ask = async () => {
        if (!question.trim() || busy) return;
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        setBusy(true);
        setError("");
        setAnswer("");
        setEvidence([]);
        setSources([]);
        const query = question.trim();
        let completed = "";
        try {
            const response = await fetch(knowledgeAiAskUrl(), {
                method: "POST",
                signal: abort.signal,
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    Authorization: localStorage.getItem("accessToken") ?? "",
                    ...deviceIdHeaders(),
                },
                body: JSON.stringify({ question: query, lang: "en", history: history.slice(-6) }),
            });
            if (!response.ok || !response.body)
                throw new Error(
                    response.status === 429
                        ? "Please wait a moment before asking again."
                        : "Search is unavailable. Your match can continue normally.",
                );
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
                const chunk = await reader.read();
                buffer += decoder.decode(chunk.value, { stream: !chunk.done }).replaceAll("\r\n", "\n");
                let boundary: number;
                while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                    const frame = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);
                    const kind = frame
                        .split("\n")
                        .find((line) => line.startsWith("event:"))
                        ?.slice(6)
                        .trim();
                    const raw = frame
                        .split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trim())
                        .join("\n");
                    if (!raw) continue;
                    const event = JSON.parse(raw) as SearchEvent;
                    if (kind === "delta") {
                        completed += event.text ?? "";
                        setAnswer(completed);
                    }
                    if (kind === "reset") {
                        completed = "";
                        setAnswer("");
                    }
                    if (kind === "done") {
                        completed = event.answer ?? completed;
                        setAnswer(completed);
                    }
                    if (kind === "error") throw new Error(event.message ?? "Search could not finish.");
                    if (kind === "sources") setSources(event.items ?? []);
                    if (kind === "premium_evidence" && event.packet)
                        setEvidence((previous) => [
                            ...previous.filter((item) => item.evidenceId !== event.packet!.evidenceId),
                            event.packet!,
                        ]);
                }
                if (chunk.done) break;
            }
            if (!completed) throw new Error("No answer received. Please try again.");
            setHistory((previous) => [
                ...previous,
                { role: "user", content: query },
                { role: "assistant", content: completed },
            ]);
        } catch (failure) {
            if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Search failed.");
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
            size="sm"
            onClick={() => setOpen((previous) => !previous)}
            sx={{
                position: anchor ? "relative" : "fixed",
                right: anchor ? undefined : 18,
                bottom: anchor ? undefined : 78,
                flexShrink: 0,
                zIndex: 1100,
                height: "35.2px",
                minHeight: "35.2px",
                px: 1,
                whiteSpace: "nowrap",
                bgcolor: "#7f3819",
                color: "#ffe0bf",
                border: "1px solid #d97d38",
                fontFamily: hocFontFamily,
                "&:hover": { bgcolor: "#a75023" },
            }}
        >
            ◆ Ask Premium
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
                            Ask about units, artifacts, synergies or counter-picks.
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
                                placeholder="Ask a game question…"
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                size="sm"
                                sx={{ ...hocInputSx, flex: 1, minWidth: 0 }}
                                slotProps={{ input: { maxLength: 600, autoFocus: true } }}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                loading={busy}
                                disabled={!question.trim()}
                                sx={{ bgcolor: "#7f3819", color: "#ffe0bf", "&:hover": { bgcolor: "#a75023" } }}
                            >
                                Ask
                            </Button>
                        </Box>
                        {(error || answer || busy || sources.length > 0 || evidence.length > 0) && (
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
                                <Box
                                    role="status"
                                    sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55, color: "#efdfce", fontSize: 13 }}
                                >
                                    {answer ? (
                                        <PremiumAnswer text={answer} />
                                    ) : busy ? (
                                        "Checking game facts and evidence…"
                                    ) : (
                                        ""
                                    )}
                                </Box>
                                {sources.length > 0 && (
                                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                                        {sources.map((source) => (
                                            <a
                                                key={source.id}
                                                href={
                                                    source.href.startsWith("/")
                                                        ? `${window.location.origin}${source.href}`
                                                        : source.href
                                                }
                                                target="_blank"
                                                rel="noreferrer"
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
                                        <summary>Snapshot evidence · {packet.independentFamilies} families</summary>
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
    return anchor ? createPortal(ui, anchor) : ui;
};
