import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, IconButton, Typography } from "@mui/joy";
import Popper from "@mui/material/Popper";
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";

import { deviceIdHeaders } from "../../api/deviceId";
import {
    fetchPremiumSearch,
    premiumSearchBody,
    premiumSearchGameId,
    readPremiumSearch,
    type PremiumSearchEvent,
} from "../../api/premium_search";
import type { PremiumEvidence } from "../../api/premium_client";
import { siteUrl } from "../../api/site_origin";
import { useAuthContext } from "../auth/context/auth_context";
import { hocFontFamily } from "../hocTheme";
import { usePremiumAccess } from "./PremiumAccess";
import { PremiumAnswer } from "./PremiumAnswer";
import { PremiumButton } from "./PremiumButton";
import { EvidenceText } from "./PremiumEvidenceText";
import { PremiumSandboxHelp } from "./PremiumSandboxHelp";
import { premiumBriefingPlan, premiumSandboxVersion, type PremiumSandboxState } from "./premiumBriefing";
import { usePremiumSearchMatch } from "./PremiumSearchMatchContext";
import { premiumSearchMatchChanged, type PremiumSearchMatchVersion } from "./premiumSearchFreshness";
import type { PremiumInspectionFocus } from "./PremiumSearchPromptContext";
import type { PremiumSearchPrompt } from "./PremiumSearch";
import { premiumSourceHref } from "./premiumSourceHref";
import { usePremiumCapability } from "./usePremiumPreference";
import { usePremiumSandboxState } from "./usePremiumSandboxState";

interface BriefingRequest {
    question: string;
    focus?: PremiumInspectionFocus;
    version?: PremiumSearchMatchVersion;
    sandboxKey?: string;
    complete: boolean;
}
const emptySandbox: PremiumSandboxState = {
    left: 0,
    right: 0,
    started: false,
    finished: false,
    lap: 0,
    map: 1,
    visibleQueue: [],
};

/** One-click explanations in the client. Free-form questions live on the website. */
export const PremiumGuide: React.FC<{
    anchor: HTMLDivElement | null;
    compact: boolean;
    prompt?: PremiumSearchPrompt;
    onAvailabilityChange?: (available: boolean) => void;
}> = ({ anchor, compact, prompt, onAvailabilityChange }) => {
    const access = usePremiumAccess();
    const enabled = usePremiumCapability("chat");
    const available = Boolean(access?.active) && enabled;
    const { user } = useAuthContext();
    const accountKey = user?.email || user?.username;
    const location = useLocation();
    const gameId = premiumSearchGameId(location.pathname);
    const matchVersion = usePremiumSearchMatch(gameId);
    const sandbox = usePremiumSandboxState(available && compact && !gameId);
    const plan = premiumBriefingPlan(matchVersion?.stage, gameId ? undefined : (sandbox.state ?? emptySandbox));
    const [open, setOpen] = useState(false);
    const [focus, setFocus] = useState<PremiumInspectionFocus>();
    const [answer, setAnswer] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [evidenceAvailable, setEvidenceAvailable] = useState<boolean>();
    const [evidence, setEvidence] = useState<PremiumEvidence[]>([]);
    const [sources, setSources] = useState<NonNullable<PremiumSearchEvent["items"]>>([]);
    const [lastRequest, setLastRequest] = useState<BriefingRequest>();
    const controller = useRef<AbortController | null>(null);
    const handledPrompt = useRef<PremiumSearchPrompt | undefined>(undefined);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const matchChanged =
        premiumSearchMatchChanged(lastRequest?.version, matchVersion) ||
        Boolean(
            !gameId &&
            lastRequest?.sandboxKey &&
            sandbox.state &&
            lastRequest.sandboxKey !== premiumSandboxVersion(sandbox.state),
        );
    const abortRequest = useCallback(() => {
        controller.current?.abort();
        controller.current = null;
        setBusy(false);
    }, []);
    const close = useCallback(() => {
        abortRequest();
        setOpen(false);
    }, [abortRequest]);
    const clear = useCallback(() => {
        setAnswer("");
        setError("");
        setStatus("");
        setEvidence([]);
        setSources([]);
        setEvidenceAvailable(undefined);
        setLastRequest(undefined);
        setFocus(undefined);
    }, []);
    useLayoutEffect(() => {
        onAvailabilityChange?.(available);
        return () => onAvailabilityChange?.(false);
    }, [available, onAvailabilityChange]);
    useLayoutEffect(() => {
        close();
        clear();
    }, [location.pathname, accountKey, available, close, clear]);
    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        close();
    }, [anchor, close]);
    useEffect(() => {
        if (!open) return;
        panelRef.current?.focus({ preventScroll: true });
        const pointer = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
        };
        const key = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            close();
            buttonRef.current?.focus();
        };
        document.addEventListener("pointerdown", pointer);
        document.addEventListener("keydown", key, true);
        return () => {
            document.removeEventListener("pointerdown", pointer);
            document.removeEventListener("keydown", key, true);
        };
    }, [open, close]);
    const prepare = useCallback(
        async (question: string, inspected?: PremiumInspectionFocus, local?: PremiumSandboxState) => {
            if (!available || !question.trim()) return;
            controller.current?.abort();
            const abort = new AbortController();
            controller.current = abort;
            setBusy(true);
            setAnswer("");
            setError("");
            setEvidence([]);
            setSources([]);
            setEvidenceAvailable(undefined);
            setFocus(inspected);
            setStatus(gameId ? "Reading the current armies…" : "Reading the practice lineup…");
            setLastRequest({
                question,
                focus: inspected,
                version: matchVersion,
                sandboxKey: local ? premiumSandboxVersion(local) : undefined,
                complete: false,
            });
            let complete = "";
            try {
                const response = await fetchPremiumSearch(
                    premiumSearchBody(question, location.pathname, [], inspected?.unitId, inspected?.optionId),
                    { Authorization: localStorage.getItem("accessToken") ?? "", ...deviceIdHeaders() },
                    abort.signal,
                );
                complete = await readPremiumSearch(
                    response,
                    (kind, event) => {
                        if (controller.current !== abort || abort.signal.aborted) return;
                        if (kind === "meta") {
                            if (gameId && event.context !== "match")
                                throw new Error("The current match could not be read. Update the plan to try again.");
                            setEvidenceAvailable(event.evidenceAvailable);
                        }
                        if (kind === "status")
                            setStatus(
                                event.phase === "answering"
                                    ? "Preparing your plan…"
                                    : "Checking mechanics and battle evidence…",
                            );
                        if (kind === "delta") {
                            complete += event.text ?? "";
                            setAnswer(complete);
                        }
                        if (kind === "reset") {
                            complete = "";
                            setAnswer("");
                        }
                        if (kind === "done") {
                            setAnswer(event.answer ?? complete);
                            setSources(event.sources ?? []);
                            setStatus("");
                        }
                        if (kind === "sources") setSources(event.items ?? []);
                        if (kind === "premium_evidence" && event.packet)
                            setEvidence((previous) => [
                                ...previous.filter((item) => item.evidenceId !== event.packet!.evidenceId),
                                event.packet!,
                            ]);
                    },
                    inspected?.unitId,
                    inspected?.optionId,
                );
                if (controller.current !== abort || abort.signal.aborted) return;
                setLastRequest((previous) => (previous ? { ...previous, complete: true } : previous));
            } catch (failure) {
                if (controller.current === abort && !abort.signal.aborted) {
                    setStatus("");
                    setError(
                        failure instanceof Error && failure.name === "TimeoutError"
                            ? "The plan took too long. Try preparing it again."
                            : failure instanceof Error
                              ? failure.message
                              : "The strategy could not be prepared.",
                    );
                }
            } finally {
                if (controller.current === abort) setBusy(false);
            }
        },
        [available, gameId, location.pathname, matchVersion],
    );
    useEffect(() => {
        if (
            !available ||
            !anchor ||
            !gameId ||
            !prompt ||
            handledPrompt.current === prompt ||
            prompt.pathname !== location.pathname ||
            prompt.accountKey !== accountKey
        )
            return;
        handledPrompt.current = prompt;
        setOpen(true);
        void prepare(prompt.question, prompt.focus);
    }, [prompt, available, anchor, gameId, location.pathname, accountKey, prepare]);
    if (!available || !anchor) return null;
    const preparePlan = () => {
        const current = gameId ? undefined : (sandbox.refresh() ?? sandbox.state ?? emptySandbox);
        const next = premiumBriefingPlan(matchVersion?.stage, current);
        setFocus(undefined);
        if (next.question) void prepare(next.question, undefined, current);
        else {
            abortRequest();
            clear();
        }
    };
    const toggle = () => {
        if (open) {
            close();
            return;
        }
        setOpen(true);
        if (focus || !lastRequest?.complete || matchChanged) preparePlan();
    };
    return createPortal(
        <>
            <Box
                component="button"
                ref={buttonRef}
                type="button"
                aria-label="Open Premium guide"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={toggle}
                sx={{
                    appearance: "none",
                    background: "transparent",
                    border: 0,
                    p: 0,
                    px: 0.5,
                    minHeight: 36,
                    width: "100%",
                    color: open ? "#ffe2b8" : "#dbb98f",
                    fontFamily: hocFontFamily,
                    fontSize: compact ? "0.8125rem" : "0.875rem",
                    fontWeight: 500,
                    lineHeight: 1.4,
                    whiteSpace: "nowrap",
                    cursor: "var(--hoc-cursor-interactive), pointer",
                    textDecoration: "underline",
                    textDecorationColor: "transparent",
                    textUnderlineOffset: 5,
                    transition: "color 140ms ease, text-decoration-color 140ms ease",
                    "&:hover": { color: "#ffe2b8", textDecorationColor: "#ae845a" },
                    "&:focus-visible": { outline: "1px solid #d5ad79", outlineOffset: 3, borderRadius: 3 },
                }}
            >
                Premium guide
            </Box>
            <Popper
                open={open}
                anchorEl={buttonRef.current}
                placement="top-end"
                modifiers={[
                    { name: "offset", options: { offset: [0, 12] } },
                    { name: "preventOverflow", options: { padding: 12 } },
                ]}
                sx={{ zIndex: 1410 }}
            >
                <Box
                    ref={panelRef}
                    id={id}
                    role="dialog"
                    aria-modal={false}
                    aria-labelledby={`${id}-title`}
                    tabIndex={-1}
                    onKeyDown={(event) => event.stopPropagation()}
                    sx={{
                        width: "min(410px, calc(100vw - 24px))",
                        maxHeight: "min(580px, calc(100dvh - 100px))",
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        boxSizing: "border-box",
                        p: 2,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                        bgcolor: "#211910f5",
                        color: "#efdfce",
                        border: "1px solid #a783515c",
                        borderRadius: "10px",
                        boxShadow: "0 12px 40px #0009",
                        fontFamily: hocFontFamily,
                        scrollbarWidth: "thin",
                        scrollbarColor: "#845c37 transparent",
                        outline: "none",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                        <Box>
                            <Typography
                                level="title-md"
                                id={`${id}-title`}
                                sx={{ color: "#f5dfc3", fontFamily: hocFontFamily, fontSize: 17 }}
                            >
                                {focus
                                    ? focus.moveNumber
                                        ? `Move ${focus.moveNumber} · ${focus.name}`
                                        : focus.name
                                    : plan.title}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: "#b99b7c", mt: 0.4 }}>
                                {focus ? "Premium explanation" : plan.subtitle}
                            </Typography>
                        </Box>
                        <IconButton
                            aria-label="Close Premium guide"
                            variant="plain"
                            size="sm"
                            onClick={() => {
                                close();
                                buttonRef.current?.focus();
                            }}
                            sx={{ color: "#c4a98b", "&:hover": { bgcolor: "#4a3824", color: "#f9dfbe" } }}
                        >
                            <CloseRoundedIcon fontSize="small" />
                        </IconButton>
                    </Box>
                    {plan.steps && !focus ? (
                        <PremiumSandboxHelp plan={plan} sandbox={sandbox.state} />
                    ) : (
                        <>
                            {matchChanged && lastRequest && (
                                <Box sx={{ borderLeft: "2px solid #bd8c55", pl: 1 }}>
                                    <Typography role="status" level="body-xs" sx={{ color: "#d5b591" }}>
                                        The position changed since this plan.
                                    </Typography>
                                    <PremiumButton
                                        startDecorator={null}
                                        variant="plain"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() =>
                                            focus && lastRequest
                                                ? void prepare(lastRequest.question, focus, sandbox.state)
                                                : preparePlan()
                                        }
                                        sx={{ minHeight: 26, p: 0, fontSize: 12 }}
                                    >
                                        Update {focus ? "explanation" : "plan"}
                                    </PremiumButton>
                                </Box>
                            )}
                            {busy && (
                                <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Box
                                        aria-hidden
                                        sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#d9ad72" }}
                                    />
                                    <Typography level="body-sm" sx={{ color: "#c5ab8d", fontSize: 12 }}>
                                        {status}
                                    </Typography>
                                </Box>
                            )}
                            {error && (
                                <Typography role="alert" sx={{ fontSize: 12, color: "#e1b294" }}>
                                    {error}
                                </Typography>
                            )}
                            <Box aria-busy={busy} sx={{ fontSize: 13, lineHeight: 1.6, color: "#e9d7c1" }}>
                                {answer && <PremiumAnswer text={answer} />}
                            </Box>
                            {(error || (!busy && !answer)) && (
                                <PremiumButton
                                    startDecorator={null}
                                    variant="plain"
                                    size="sm"
                                    onClick={() =>
                                        focus && lastRequest
                                            ? void prepare(lastRequest.question, focus, sandbox.state)
                                            : preparePlan()
                                    }
                                    sx={{ alignSelf: "flex-start", px: 0, minHeight: 28, fontSize: 12 }}
                                >
                                    {error ? "Try again" : "Prepare strategy"}
                                </PremiumButton>
                            )}
                            {busy && (
                                <PremiumButton
                                    startDecorator={null}
                                    variant="plain"
                                    size="sm"
                                    onClick={() => {
                                        abortRequest();
                                        setStatus("Plan stopped.");
                                    }}
                                    sx={{ alignSelf: "flex-start", px: 0, minHeight: 26, fontSize: 12 }}
                                >
                                    Stop
                                </PremiumButton>
                            )}
                            {focus && !busy && (
                                <PremiumButton
                                    startDecorator={null}
                                    variant="plain"
                                    size="sm"
                                    onClick={preparePlan}
                                    sx={{ alignSelf: "flex-start", px: 0, minHeight: 26, fontSize: 12 }}
                                >
                                    Back to battle plan
                                </PremiumButton>
                            )}
                            {answer && !busy && !matchChanged && !focus && (
                                <PremiumButton
                                    startDecorator={null}
                                    variant="plain"
                                    size="sm"
                                    onClick={preparePlan}
                                    sx={{ alignSelf: "flex-start", px: 0, minHeight: 26, fontSize: 12 }}
                                >
                                    Refresh plan
                                </PremiumButton>
                            )}
                            {evidenceAvailable === false && (
                                <Typography level="body-xs" sx={{ color: "#b99d80" }}>
                                    Battle statistics are unavailable for this briefing.
                                </Typography>
                            )}
                            {(sources.length > 0 || evidence.length > 0) && (
                                <Box
                                    component="details"
                                    sx={{ borderTop: "1px solid #96714d44", pt: 1, fontSize: 11, color: "#c9ad8e" }}
                                >
                                    <Box component="summary" sx={{ cursor: "pointer" }}>
                                        Battle data & sources
                                    </Box>
                                    {sources.map((source) => {
                                        const href = premiumSourceHref(source.href);
                                        return href ? (
                                            <Box
                                                key={source.id}
                                                component="a"
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                sx={{ display: "block", color: "#dab48c", mt: 1 }}
                                            >
                                                {source.name}
                                            </Box>
                                        ) : null;
                                    })}
                                    {evidence.map((packet) => (
                                        <Box
                                            component="details"
                                            key={packet.evidenceId}
                                            sx={{ borderTop: "1px solid #96714d33", mt: 1, pt: 1 }}
                                        >
                                            <summary>
                                                {packet.label ?? "Recorded battles"} · {packet.independentFamilies}{" "}
                                                paired samples
                                            </summary>
                                            <EvidenceText evidence={packet} />
                                            <Typography level="body-xs" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                                                {packet.caveat}
                                            </Typography>
                                            <Typography level="body-xs" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                                                {packet.evidenceId}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </>
                    )}
                    <Box
                        component="a"
                        href={siteUrl("/premium/#premium-search")}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                            borderTop: "1px solid #96714d33",
                            pt: 1.2,
                            color: "#c5a27e",
                            fontSize: 11,
                            textDecorationColor: "#856141",
                            textUnderlineOffset: 3,
                        }}
                    >
                        Questions and comparisons on the website ↗
                    </Box>
                </Box>
            </Popper>
        </>,
        anchor,
    );
};
