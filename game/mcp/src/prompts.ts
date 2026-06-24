import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const createPlayTurnPromptText = (input: {
    matchId: string;
    team?: "LOWER" | "UPPER";
    reason: string;
    style: string;
}): string => {
    const teamLine = input.team ? `You are controlling team ${input.team}.` : "You are controlling the active team.";

    return `You are the Heroes of Crypto AI player for match ${input.matchId}.

${teamLine}
Reason: ${input.reason}
Style: ${input.style}

Use the tools and resources in this order:
1. Read hoc://rules/summary if you need the compact game loop reminder.
2. Read hoc://units for unit stats.
3. Read hoc://abilities, hoc://spells, hoc://effects, hoc://auras, or hoc://synergies when a named mechanic affects the decision.
4. Call get_state for match ${input.matchId}.
5. Call list_legal_actions for the team you control.
6. Call evaluate_actions when you want the local tactical ranking for those legal actions.
7. Choose only one listed actionId. Do not invent coordinates, unit ids, spells, or actions.
8. If you are asked to act directly, call submit_action with that actionId.
9. If you are asked to play the whole bot turn, call play_ai_turn instead.

Prefer actions that produce damage, deny enemy tempo, or improve a clear future attack. Use action evaluation metadata: priorityScore, damage range, targetTotalHp, killsTarget, targetValue, retaliation, spell target type, spell power type, spell duration, remaining casts, and estimated spell value. Use movement when the target is not reachable yet. Defend or end turn only when the legal actions do not offer useful pressure. The common game engine is authoritative; your job is tactical selection from legal actions.`;
};

export const registerGamePrompts = (server: McpServer): void => {
    server.registerPrompt(
        "play-turn",
        {
            title: "Play A Heroes Of Crypto Turn",
            description: "Guide a model through choosing or playing a legal Heroes of Crypto AI turn.",
            argsSchema: {
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
        },
        ({ matchId, reason, style, team }) => ({
            description: "A concise operating prompt for model-controlled Heroes of Crypto turns.",
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: createPlayTurnPromptText({ matchId, reason, style, team }),
                    },
                },
            ],
        }),
    );
};
