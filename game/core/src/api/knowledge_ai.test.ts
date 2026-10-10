import { describe, expect, it } from "bun:test";
import { resolveKnowledgeAiUrl } from "./knowledge_ai";

describe("game Knowledge AI routing", () => {
    it.each(["app.heroesofcrypto.io", "beta.heroesofcrypto.io", "test.heroesofcrypto.io", "heroesofcrypto.io"])(
        "routes %s to the existing shared assistant service",
        (hostname) => {
            expect(resolveKnowledgeAiUrl(undefined, hostname)).toBe("https://test.heroesofcrypto.io/ai/knowledge");
        },
    );
    it.each(["localhost", "127.0.0.1", "192.168.1.10"])("keeps %s development on the local assistant", (hostname) => {
        expect(resolveKnowledgeAiUrl(undefined, hostname)).toBe("http://127.0.0.1:3020/ai/knowledge");
    });
    it("honors an explicit service endpoint and removes trailing slashes", () => {
        expect(resolveKnowledgeAiUrl(" https://ai.example/ai/knowledge/// ", "localhost")).toBe(
            "https://ai.example/ai/knowledge",
        );
    });
});
