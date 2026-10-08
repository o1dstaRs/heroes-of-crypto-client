import { PremiumAnswer } from "./PremiumAnswer";
import { Box, Button, Input, Modal, ModalClose, ModalDialog, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { deviceIdHeaders } from "../../api/deviceId";
import type { PremiumEvidence } from "../../api/premium_client";
import { EvidenceText, usePremiumAdvisor } from "./PremiumAdvisor";

interface SearchEvent {
    text?: string;
    answer?: string;
    message?: string;
    items?: { id: string; name: string; href: string }[];
    sources?: { id: string; name: string; href: string }[];
    packet?: PremiumEvidence;
}

export const PremiumSearch: React.FC = () => {
    const { advice } = usePremiumAdvisor();
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
    if (!advice) return null;
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
            const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
            const base = local ? "http://127.0.0.1:3020" : window.location.origin;
            const response = await fetch(`${base}/ai/knowledge/ask`, {
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
    return (
        <>
            <Button
                aria-label="Open Premium AI Search"
                size="sm"
                onClick={() => setOpen(true)}
                sx={{
                    position: "fixed",
                    right: 18,
                    bottom: 78,
                    zIndex: 1100,
                    bgcolor: "#7f3819",
                    color: "#ffe0bf",
                    border: "1px solid #d97d38",
                    "&:hover": { bgcolor: "#a75023" },
                }}
            >
                ◆ Ask Premium
            </Button>
            <Modal open={open} onClose={() => setOpen(false)}>
                <ModalDialog
                    sx={{
                        width: "min(700px, 94vw)",
                        maxHeight: "85vh",
                        overflow: "auto",
                        bgcolor: "#21160f",
                        borderColor: "#a95e2e",
                    }}
                >
                    <ModalClose aria-label="Close Premium Search" />
                    <Typography level="h4" sx={{ color: "#f5a562" }}>
                        Premium AI Search
                    </Typography>
                    <Typography level="body-sm">
                        Ask about units, artifacts, synergies or counter-picks. Answers combine game rules with the
                        frozen self-play evidence.
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
                            placeholder="How does Monk perform alongside shooters?"
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            sx={{ flex: 1 }}
                            slotProps={{ input: { maxLength: 600 } }}
                        />
                        <Button type="submit" loading={busy} disabled={!question.trim()}>
                            Ask
                        </Button>
                    </Box>
                    {error && (
                        <Typography role="alert" sx={{ color: "#f6b287" }}>
                            {error}
                        </Typography>
                    )}
                    <Box
                        role="status"
                        sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65, color: "#efdfce", fontSize: 14 }}
                    >
                        {answer ? <PremiumAnswer text={answer} /> : busy ? "Checking game facts and evidence…" : ""}
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
                </ModalDialog>
            </Modal>
        </>
    );
};
