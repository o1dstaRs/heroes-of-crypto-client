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
2. Read hoc://strategy/primer for win condition, draft/turn goals, synergy guidance, spell priorities, and tactical heuristics.
3. Read hoc://units for unit stats.
4. Read hoc://abilities, hoc://spells, hoc://effects, hoc://auras, or hoc://synergies when a named mechanic affects the decision.
5. Call get_state for match ${input.matchId}.
6. Call list_legal_actions for the team you control.
7. Call evaluate_actions when you want the local tactical ranking for those legal actions.
8. Choose only one listed actionId. Do not invent coordinates, unit ids, spells, or actions.
9. If you are asked to act directly, call submit_action with that actionId.
10. If you are asked to play the whole bot turn, call play_ai_turn instead.

Prefer actions that produce damage, deny enemy tempo, or improve a clear future attack. Use action evaluation metadata: priorityScore, damage range, targetTotalHp, killsTarget, targetValue, retaliation, spell target type, spell power type, spell duration, remaining casts, and estimated spell value. Use movement when the target is not reachable yet. Defend or end turn only when the legal actions do not offer useful pressure. The common game engine is authoritative; your job is tactical selection from legal actions.`;
};

export const createDraftArmyPromptText = (input: {
    matchId: string;
    team?: "LOWER" | "UPPER";
    reason: string;
    style: string;
}): string => {
    const teamLine = input.team ? `You are drafting for team ${input.team}.` : "You are drafting for the active team.";

    return `You are the Heroes of Crypto AI draft player for match ${input.matchId}.

${teamLine}
Reason: ${input.reason}
Style: ${input.style}

Use the tools and resources in this order:
1. Read hoc://strategy/primer for win condition, army composition goals, faction synergy guidance, and ban priorities.
2. Read hoc://units for the unit roster when you need exact creature stats.
3. Read hoc://abilities, hoc://spells, hoc://effects, hoc://auras, or hoc://synergies when a named mechanic affects a pick or ban.
4. Call get_draft_state for match ${input.matchId}.
5. Call list_draft_actions for the team you control.
6. Call evaluate_draft_actions when you want the local draft ranking.
7. Choose only one listed actionId. Do not invent creature ids, pair indexes, bans, or picks.
8. If you are asked to act directly, call submit_draft_action with that actionId.
9. If you are asked to play all currently available AI draft steps, call play_ai_draft instead.

Pick strong creatures that complete the required level counts, keep a mix of damage, ranged pressure, magic, durability, and tempo, and ban high-value creatures or faction-relevant options from the opponent. In this version, ranged pressure is a primary draft axis: try to out-pick the opponent in ranged units. Tsar Cannon and Gargantuan are premium ranged threats; secure one when legal and useful, otherwise ban them or make sure they are already banned/unavailable. The draft tools are authoritative; your job is selection from legal actions. When the draft completes, continue with the normal play-turn workflow on the completed match.`;
};

export const registerGamePrompts = (server: McpServer): void => {
    server.registerPrompt(
        "draft-army",
        {
            title: "Draft A Heroes Of Crypto Army",
            description: "Guide a model through choosing or playing legal Heroes of Crypto pick/ban actions.",
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
            description: "A concise operating prompt for model-controlled Heroes of Crypto drafts.",
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: createDraftArmyPromptText({ matchId, reason, style, team }),
                    },
                },
            ],
        }),
    );

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
