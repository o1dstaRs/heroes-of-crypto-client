import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import type { GameAction } from "@heroesofcrypto/common";

import { registerGamePrompts } from "./prompts";
import { registerGameResources } from "./resources";
import { HeadlessMatchStore } from "./session_store";
import type { AIReason, AIStyle, TeamName } from "./types";

const jsonResponse = (value: unknown) => ({
    content: [
        {
            type: "text" as const,
            text: JSON.stringify(value, null, 2),
        },
    ],
});

const parseActionJson = (actionJson: string | undefined): GameAction | undefined => {
    if (!actionJson) {
        return undefined;
    }
    return JSON.parse(actionJson) as GameAction;
};

export function createHeroesMcpServer(store = new HeadlessMatchStore()): McpServer {
    const server = new McpServer({
        name: "heroes-of-crypto-game",
        version: "0.1.5",
    });
    registerGameResources(server);
    registerGamePrompts(server);

    server.tool(
        "create_match",
        "Create a quick headless Heroes of Crypto match for AI play.",
        {
            matchId: z.string().optional(),
            scenario: z
                .enum(["quickstart", "approach", "priority_targets", "spell_duel", "summon_duel"])
                .default("quickstart"),
        },
        async ({ matchId, scenario }) => {
            const match =
                scenario === "approach"
                    ? store.createApproachScenario(matchId)
                    : scenario === "priority_targets"
                      ? store.createPriorityTargetScenario(matchId)
                      : scenario === "spell_duel"
                        ? store.createSpellDuelScenario(matchId)
                        : scenario === "summon_duel"
                          ? store.createSummonScenario(matchId)
                          : store.createQuickstart(matchId);
            return jsonResponse({
                state: match.getState(),
                legalActions: match.listLegalActions(),
            });
        },
    );

    server.tool(
        "get_state",
        "Get public match state.",
        {
            matchId: z.string(),
        },
        async ({ matchId }) => jsonResponse(store.getOrThrow(matchId).getState()),
    );

    server.tool(
        "list_legal_actions",
        "List legal actions for the active unit.",
        {
            matchId: z.string(),
            team: z.enum(["LOWER", "UPPER"]).optional(),
        },
        async ({ matchId, team }) => jsonResponse(store.getOrThrow(matchId).listLegalActions(team as TeamName)),
    );

    server.tool(
        "evaluate_actions",
        "List legal actions ranked by the built-in tactical scorer.",
        {
            matchId: z.string(),
            team: z.enum(["LOWER", "UPPER"]).optional(),
            style: z.enum(["balanced", "aggressive", "defensive"]).default("balanced"),
        },
        async ({ matchId, style, team }) =>
            jsonResponse(
                store.getOrThrow(matchId).evaluateActions({
                    style: style as AIStyle,
                    team: team as TeamName | undefined,
                }),
            ),
    );

    server.tool(
        "choose_action",
        "Choose an AI action for the current turn.",
        {
            matchId: z.string(),
            team: z.enum(["LOWER", "UPPER"]).optional(),
            reason: z
                .enum([
                    "sandbox_toggle",
                    "pc_opponent",
                    "opponent_timeout",
                    "opponent_disconnected",
                    "server_bot",
                    "benchmark",
                ])
                .default("server_bot"),
            style: z.enum(["balanced", "aggressive", "defensive"]).default("balanced"),
        },
        async ({ matchId, reason, style, team }) =>
            jsonResponse(
                store.getOrThrow(matchId).chooseAction({
                    reason: reason as AIReason,
                    style: style as AIStyle,
                    team: team as TeamName | undefined,
                }),
            ),
    );

    server.tool(
        "submit_action",
        "Submit a legal action by action id, or a raw GameAction JSON object.",
        {
            matchId: z.string(),
            team: z.enum(["LOWER", "UPPER"]),
            actionId: z.string().optional(),
            actionJson: z.string().optional(),
        },
        async ({ actionId, actionJson, matchId, team }) =>
            jsonResponse(
                store.getOrThrow(matchId).submitAction({
                    team: team as TeamName,
                    actionId,
                    action: parseActionJson(actionJson),
                }),
            ),
    );

    server.tool(
        "play_ai_turn",
        "Choose and submit actions until the bot-controlled active team finishes its turn or the fight ends.",
        {
            matchId: z.string(),
            team: z.enum(["LOWER", "UPPER"]).optional(),
            reason: z
                .enum([
                    "sandbox_toggle",
                    "pc_opponent",
                    "opponent_timeout",
                    "opponent_disconnected",
                    "server_bot",
                    "benchmark",
                ])
                .default("server_bot"),
            style: z.enum(["balanced", "aggressive", "defensive"]).default("balanced"),
            maxActions: z.number().int().positive().max(16).default(8),
        },
        async ({ matchId, maxActions, reason, style, team }) =>
            jsonResponse(
                store.getOrThrow(matchId).playAiTurn({
                    reason: reason as AIReason,
                    style: style as AIStyle,
                    team: team as TeamName | undefined,
                    maxActions,
                }),
            ),
    );

    return server;
}

if (import.meta.main) {
    const transport = new StdioServerTransport();
    await createHeroesMcpServer().connect(transport);
}
