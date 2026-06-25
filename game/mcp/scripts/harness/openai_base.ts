export const normalizeOpenAiBaseUrl = (value: string): string => {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed) {
        return "http://127.0.0.1:9091/v1";
    }

    try {
        const url = new URL(trimmed);
        if (url.pathname === "" || url.pathname === "/") {
            url.pathname = "/v1";
            return url.toString().replace(/\/+$/, "");
        }
        if (url.pathname.endsWith("/v1")) {
            return url.toString().replace(/\/+$/, "");
        }
        return url.toString().replace(/\/+$/, "");
    } catch {
        return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
    }
};

const sanitizeChatContent = (content: string): string => content.replace(/\0/g, "").slice(0, 8000);

const chatContentFromJson = (responseJson: unknown): string => {
    const choice = (
        responseJson as {
            choices?: Array<{
                message?: { content?: unknown };
                text?: unknown;
            }>;
        }
    ).choices?.[0];
    const content = choice?.message?.content ?? choice?.text;
    if (typeof content === "string") {
        return sanitizeChatContent(content);
    }
    if (Array.isArray(content)) {
        return sanitizeChatContent(
            content
                .map((part) => {
                    if (typeof part === "string") {
                        return part;
                    }
                    if (part && typeof part === "object" && "text" in part) {
                        return String((part as { text: unknown }).text);
                    }
                    return "";
                })
                .join("\n"),
        );
    }
    return "";
};

const appendStreamPayload = (payload: string): string => {
    if (!payload || payload === "[DONE]") {
        return "";
    }

    try {
        const parsed = JSON.parse(payload) as {
            choices?: Array<{
                delta?: { content?: unknown };
                message?: { content?: unknown };
                text?: unknown;
            }>;
        };
        const choice = parsed.choices?.[0];
        const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
        return typeof content === "string" ? content : "";
    } catch {
        return "";
    }
};

const chatContentFromStream = async (response: Response): Promise<string> => {
    if (!response.body) {
        return "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
            if (payload === "[DONE]") {
                return sanitizeChatContent(content);
            }
            content += appendStreamPayload(payload);
        }
    }

    const tail = buffer.trim();
    if (tail) {
        const payload = tail.startsWith("data:") ? tail.slice(5).trim() : tail;
        content += appendStreamPayload(payload);
    }
    return sanitizeChatContent(content);
};

export const readOpenAiChatContent = async (response: Response): Promise<string> => {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/event-stream")) {
        return chatContentFromStream(response);
    }

    if (contentType.includes("application/json")) {
        return chatContentFromJson(await response.json());
    }

    const text = await response.text();
    if (text.includes("data:")) {
        let content = "";
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) {
                continue;
            }
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
                break;
            }
            content += appendStreamPayload(payload);
        }
        return sanitizeChatContent(content);
    }

    try {
        return chatContentFromJson(JSON.parse(text));
    } catch {
        return sanitizeChatContent(text);
    }
};

export const fetchOpenAiChatContent = async (input: {
    modelApiBase: string;
    body: Record<string, unknown>;
    signal?: AbortSignal;
}): Promise<{ content: string; usedStream: boolean }> => {
    const preferStream = process.env.HOC_MODEL_STREAM !== "0";
    const attempts = preferStream ? [true, false] : [false];
    let lastError: unknown;

    for (const stream of attempts) {
        try {
            const response = await fetch(`${input.modelApiBase}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: input.signal,
                body: JSON.stringify({
                    ...input.body,
                    stream,
                }),
            });
            if (!response.ok) {
                throw new Error(`http_${response.status}`);
            }

            const content = await readOpenAiChatContent(response);
            if (content.trim() || !stream) {
                return { content, usedStream: stream };
            }
            lastError = new Error("empty_stream_response");
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "model_request_failed"));
};
