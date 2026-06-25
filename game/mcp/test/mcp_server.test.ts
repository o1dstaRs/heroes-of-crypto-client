import { describe, expect, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { createHeroesMcpServer } from "../src/server";

const callJsonTool = async <T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const first = result.content[0];
    if (!first || first.type !== "text") {
        throw new Error(`Tool ${name} did not return text content`);
    }
    return JSON.parse(first.text) as T;
};

describe("MCP server tools", () => {
    test("creates, inspects, chooses, and submits a headless match action", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const tools = await client.listTools();
            expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
                "choose_action",
                "choose_draft_action",
                "create_draft",
                "create_match",
                "evaluate_actions",
                "evaluate_draft_actions",
                "get_draft_state",
                "get_state",
                "list_draft_actions",
                "list_legal_actions",
                "play_ai_draft",
                "play_ai_turn",
                "submit_action",
                "submit_draft_action",
            ]);

            const resources = await client.listResources();
            expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
                "hoc://abilities",
                "hoc://auras",
                "hoc://effects",
                "hoc://rules/summary",
                "hoc://spells",
                "hoc://strategy/primer",
                "hoc://synergies",
                "hoc://units",
            ]);

            const prompts = await client.listPrompts();
            expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual(["draft-army", "play-turn"]);

            const created = await callJsonTool<{
                state: { matchId: string; phase: string; activeTeam?: string };
                legalActions: Array<{ id: string; kind: string }>;
            }>(client, "create_match", { matchId: "mcp-tool-test" });
            expect(created.state.matchId).toBe("mcp-tool-test");
            expect(created.state.phase).toBe("fight");
            expect(created.state.activeTeam).toBe("LOWER");
            expect(created.legalActions.some((action) => action.kind === "melee_attack")).toBe(true);

            const decision = await callJsonTool<{ actionId: string; action: { type: string } }>(
                client,
                "choose_action",
                {
                    matchId: "mcp-tool-test",
                    team: "LOWER",
                    reason: "server_bot",
                    style: "aggressive",
                },
            );
            expect(decision.action.type).toBe("melee_attack");

            const submitted = await callJsonTool<{
                completed: boolean;
                state: { phase: string; winner?: string };
            }>(client, "submit_action", {
                matchId: "mcp-tool-test",
                team: "LOWER",
                actionId: decision.actionId,
            });
            expect(submitted.completed).toBe(true);
            expect(submitted.state.phase).toBe("finished");
            expect(submitted.state.winner).toBe("LOWER");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("exposes a model-facing play-turn prompt", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const prompt = await client.getPrompt({
                name: "play-turn",
                arguments: {
                    matchId: "prompt-test",
                    team: "LOWER",
                    reason: "sandbox_toggle",
                    style: "aggressive",
                },
            });
            const text = prompt.messages[0]?.content.type === "text" ? prompt.messages[0].content.text : "";

            expect(text).toContain("match prompt-test");
            expect(text).toContain("controlling team LOWER");
            expect(text).toContain("list_legal_actions");
            expect(text).toContain("Do not invent");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("runs a full AI draft and creates a playable match", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const created = await callJsonTool<{
                state: { matchId: string; draftPhase: string; activeTeams: string[] };
                legalActions: Array<{ id: string; kind: string; team: string }>;
            }>(client, "create_draft", { matchId: "mcp-draft-test" });

            expect(created.state.matchId).toBe("mcp-draft-test");
            expect(created.state.draftPhase).toBe("initial_pick");
            expect(created.state.activeTeams).toEqual(["LOWER"]);
            expect(created.legalActions.some((action) => action.kind === "pick_initial_pair")).toBe(true);

            const played = await callJsonTool<{
                completed: boolean;
                stoppedReason: string;
                state: { phase: string };
                completedMatch?: { phase: string; activeTeam?: string; units: unknown[] };
            }>(client, "play_ai_draft", {
                matchId: "mcp-draft-test",
                reason: "server_bot",
                style: "balanced",
                maxActions: 20,
            });

            expect(played.completed).toBe(true);
            expect(played.stoppedReason).toBe("draft_complete");
            expect(played.state.phase).toBe("complete");
            expect(played.completedMatch?.phase).toBe("fight");
            expect(played.completedMatch?.units).toHaveLength(12);

            const legalActions = await callJsonTool<Array<{ kind: string }>>(client, "list_legal_actions", {
                matchId: "mcp-draft-test",
                team: played.completedMatch?.activeTeam,
            });
            expect(legalActions.length).toBeGreaterThan(0);
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("exposes a model-facing draft-army prompt", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const prompt = await client.getPrompt({
                name: "draft-army",
                arguments: {
                    matchId: "prompt-draft-test",
                    team: "UPPER",
                    reason: "pc_opponent",
                    style: "defensive",
                },
            });
            const text = prompt.messages[0]?.content.type === "text" ? prompt.messages[0].content.text : "";

            expect(text).toContain("match prompt-draft-test");
            expect(text).toContain("drafting for team UPPER");
            expect(text).toContain("list_draft_actions");
            expect(text).toContain("Do not invent");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("exposes rules and unit roster resources", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const rules = await client.readResource({ uri: "hoc://rules/summary" });
            const rulesText = rules.contents[0]?.type === undefined ? rules.contents[0]?.text : undefined;
            expect(rulesText).toContain("turn-based tactics");
            expect(rulesText).toContain("@heroesofcrypto/common");

            const strategy = await client.readResource({ uri: "hoc://strategy/primer" });
            const strategyText = strategy.contents[0]?.type === undefined ? strategy.contents[0]?.text : undefined;
            expect(strategyText).toContain("Win by destroying every enemy stack");
            expect(strategyText).toContain("Faction synergy goals");

            const roster = await client.readResource({ uri: "hoc://units" });
            const rosterText = roster.contents[0]?.type === undefined ? roster.contents[0]?.text : undefined;
            const parsed = JSON.parse(rosterText ?? "{}") as { units?: Array<{ name: string; faction: string }> };
            expect(parsed.units?.some((unit) => unit.name === "Squire" && unit.faction === "Life")).toBe(true);

            const abilities = await client.readResource({ uri: "hoc://abilities" });
            const abilitiesText = abilities.contents[0]?.type === undefined ? abilities.contents[0]?.text : undefined;
            const parsedAbilities = JSON.parse(abilitiesText ?? "{}") as Record<string, { desc?: string[] }>;
            expect(parsedAbilities.Sniper?.desc?.[0]).toContain("long distances");

            const spells = await client.readResource({ uri: "hoc://spells" });
            const spellsText = spells.contents[0]?.type === undefined ? spells.contents[0]?.text : undefined;
            const parsedSpells = JSON.parse(spellsText ?? "{}") as Record<string, Record<string, { desc?: string[] }>>;
            expect(parsedSpells.System?.Morale?.desc?.[0]).toContain("maximum morale");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("runs a full bot turn through the MCP tool API", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            await callJsonTool(client, "create_match", {
                matchId: "mcp-full-turn-test",
                scenario: "approach",
            });

            const played = await callJsonTool<{
                completed: boolean;
                stoppedReason: string;
                decisions: Array<{ action: { type: string } }>;
                state: { phase: string; winner?: string };
            }>(client, "play_ai_turn", {
                matchId: "mcp-full-turn-test",
                team: "LOWER",
                reason: "server_bot",
                style: "aggressive",
            });

            expect(played.completed).toBe(true);
            expect(played.stoppedReason).toBe("fight_finished");
            expect(played.decisions.map((decision) => decision.action.type)).toEqual(["move_unit", "melee_attack"]);
            expect(played.state.phase).toBe("finished");
            expect(played.state.winner).toBe("LOWER");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("returns evaluated legal actions and chooses the dangerous target", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            await callJsonTool(client, "create_match", {
                matchId: "mcp-priority-test",
                scenario: "priority_targets",
            });

            const legalActions = await callJsonTool<Array<{ kind: string; evaluation?: { targetName?: string } }>>(
                client,
                "list_legal_actions",
                {
                    matchId: "mcp-priority-test",
                    team: "LOWER",
                },
            );
            expect(
                legalActions.some(
                    (action) => action.kind === "melee_attack" && action.evaluation?.targetName === "Upper Arbalester",
                ),
            ).toBe(true);

            const decision = await callJsonTool<{ explanation: string; action: { type: string } }>(
                client,
                "choose_action",
                {
                    matchId: "mcp-priority-test",
                    team: "LOWER",
                    reason: "server_bot",
                    style: "aggressive",
                },
            );

            expect(decision.action.type).toBe("melee_attack");
            expect(decision.explanation).toContain("Upper Arbalester");
        } finally {
            await client.close();
            await server.close();
        }
    });

    test("creates a spell duel scenario with castable spell actions", async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "mcp-test-client", version: "0.1.5" });
        const server = createHeroesMcpServer();

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        try {
            const created = await callJsonTool<{
                legalActions: Array<{ kind: string; evaluation?: { spell?: { name?: string } } }>;
            }>(client, "create_match", {
                matchId: "mcp-spell-test",
                scenario: "spell_duel",
            });

            expect(
                created.legalActions.some(
                    (action) => action.kind === "cast_spell" && action.evaluation?.spell?.name === "Sadness",
                ),
            ).toBe(true);

            const decision = await callJsonTool<{ action: { type: string }; explanation: string }>(
                client,
                "choose_action",
                {
                    matchId: "mcp-spell-test",
                    team: "LOWER",
                    reason: "server_bot",
                    style: "aggressive",
                },
            );

            expect(decision.action.type).toBe("cast_spell");
            expect(decision.explanation).toContain("Sadness");

            const evaluated = await callJsonTool<
                Array<{
                    rank: number;
                    score: number;
                    action: { type: string };
                    evaluation?: { spell?: { name?: string } };
                }>
            >(client, "evaluate_actions", {
                matchId: "mcp-spell-test",
                team: "LOWER",
                style: "aggressive",
            });

            expect(evaluated[0]?.rank).toBe(1);
            expect(evaluated[0]?.score).toBeGreaterThan(0);
            expect(evaluated[0]?.action.type).toBe("cast_spell");
            expect(evaluated[0]?.evaluation?.spell?.name).toBe("Sadness");
        } finally {
            await client.close();
            await server.close();
        }
    });
});
