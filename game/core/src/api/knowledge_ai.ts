const SHARED_KNOWLEDGE_AI = "https://test.heroesofcrypto.io/ai/knowledge";
const LOCAL_KNOWLEDGE_AI = "http://127.0.0.1:3020/ai/knowledge";

export function resolveKnowledgeAiUrl(configured: string | undefined, hostname: string): string {
    if (configured?.trim()) return configured.trim().replace(/\/+$/, "");
    return hostname === "heroesofcrypto.io" || hostname.endsWith(".heroesofcrypto.io")
        ? SHARED_KNOWLEDGE_AI
        : LOCAL_KNOWLEDGE_AI;
}

export const knowledgeAiAskUrl = (): string =>
    `${resolveKnowledgeAiUrl(import.meta.env.VITE_KNOWLEDGE_AI_URL, globalThis.location?.hostname ?? "")}/ask`;
