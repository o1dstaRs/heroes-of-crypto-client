import type { PremiumChoice } from "../../api/premium_client";
import type { PremiumSearchMatchVersion } from "./premiumSearchFreshness";

export interface PremiumQuestion {
    label: string;
    question: string;
}

const questions: Record<NonNullable<PremiumSearchMatchVersion["stage"]> | "general" | "match", PremiumQuestion[]> = {
    general: [
        {
            label: "Build an army",
            question:
                "How should I build a balanced six-creature ranked army? Explain the fixed draft levels, key roles, and one practical plan.",
        },
        {
            label: "Compare artifacts",
            question:
                "How should I choose artifacts for a ranged army versus a magic-damage army? Explain native beneficiaries and the main tradeoffs without inventing win rates.",
        },
        {
            label: "Counter shooters",
            question:
                "How should I approach a ranged-heavy opponent? Give a conditional plan and the main risk, without assuming you can see a live board.",
        },
    ],
    match: [
        {
            label: "Get a plan",
            question:
                "Give me a practical plan for the current stage of my match, using only the latest authorized briefing and legal options.",
        },
        {
            label: "Biggest risk",
            question:
                "What is the biggest risk for my army at this stage? Use the revealed opponent and current artifacts, and separate facts from conditional advice.",
        },
        {
            label: "Artifact fit",
            question:
                "Which of my current units actually benefit from my selected artifacts, and what costs or trigger conditions should I watch?",
        },
    ],
    draft: [
        {
            label: "Compare offers",
            question:
                "Compare my currently legal draft offers for my army and revealed opponent. Explain the preferred choice, its main tradeoff, and what would change the choice.",
        },
        {
            label: "Artifact fit",
            question:
                "Which units in my current army benefit from my selected artifacts, and how should that affect my next legal draft pick?",
        },
        {
            label: "Army gaps",
            question:
                "What is the biggest gap in my drafted army so far, and which currently legal offer best addresses it? Use only revealed opponent information.",
        },
    ],
    setup: [
        {
            label: "Explain build",
            question:
                "Explain the recommended augment and synergy build for this army. Distinguish my actual selections from proposed changes, account for my artifacts, and stay within my current budget.",
        },
        {
            label: "Artifact fit",
            question:
                "Check which of my units benefit from my selected artifacts and which upgrades support those interactions. Explain the main opportunity cost.",
        },
        {
            label: "Main threat",
            question:
                "Which revealed opponent threat should my build address first, and what is a credible alternative within my current budget? Do not assume hidden placement or builds.",
        },
    ],
    board: [
        {
            label: "Placement plan",
            question:
                "How should I place my current army around its artifacts and roles? Give a conditional placement plan using my visible formation; do not invent hidden opponent positions.",
        },
        {
            label: "Check spacing",
            question:
                "Check my visible formation for spacing risks, artifact interactions, and exposed support units. Explain tradeoffs without assuming the enemy's hidden placement.",
        },
        {
            label: "Before Ready",
            question:
                "What are the most useful things to check before I press Ready with this army, selected build, and artifacts? Focus on the current placement stage.",
        },
    ],
    fight: [
        {
            label: "Explain this turn",
            question:
                "Explain my current legal preferred move and its alternative from the latest match briefing. Include relevant artifact triggers, resource costs, and collateral risks. If it is not my turn, give a conditional next-turn plan.",
        },
        {
            label: "Biggest risk",
            question:
                "What is the biggest visible risk on the current battlefield? Check artifact collateral, active effects, and remaining resources without inventing damage or kill predictions.",
        },
        {
            label: "Resource check",
            question:
                "Check the currently acting unit's remaining attacks, spells, and suppressed passive abilities. Say which side it belongs to, use current resources and effects instead of its printed kit, and do not recommend an out-of-turn action.",
        },
    ],
    finished: [
        {
            label: "Review position",
            question:
                "Review the final visible position and remaining armies. Distinguish what the current briefing shows from possible explanations; do not invent earlier turns or issue a next-turn command.",
        },
        {
            label: "Artifact lessons",
            question:
                "What can I learn about this army's artifact fit for a future game? Explain native beneficiaries and costs without inventing how often an effect triggered in the finished fight.",
        },
        {
            label: "Next-game plan",
            question:
                "Suggest one practical improvement for a future draft or build based on this army and revealed opponent. Keep it conditional and do not invent the finished match's history.",
        },
    ],
};

export const premiumQuestions = (inMatch: boolean, stage?: PremiumSearchMatchVersion["stage"]): PremiumQuestion[] =>
    questions[inMatch ? (stage ?? "match") : "general"];

export const premiumChoiceQuestion = (choice: Pick<PremiumChoice, "label">): string =>
    `How does ${choice.label} compare with the highlighted choices and other currently legal offers for my army? Include my selected artifacts and the revealed opponent, explain its main tradeoff, and do not assume it is recommended just because I inspected it.`;

export const premiumUnitQuestion = (name: string, topic?: { kind: "ability" | "status"; name: string }): string =>
    topic?.kind === "status"
        ? `What does ${topic.name} currently do to this inspected ${name} stack, and what legal ways could remove or work around it? Use this exact stack's current effects and resources; distinguish verified options from conditions that are not yet met.`
        : topic?.kind === "ability"
          ? `How does ${topic.name} work for this inspected ${name} stack right now? Check whether it is owned, suppressed or spent, and explain its trigger, beneficiaries and main restriction using the current authorized board.`
          : `Explain this inspected ${name} stack's role and biggest current restriction or risk, using its live resources, effects, artifacts and the visible opponent. Distinguish this exact stack from the acting unit and say whether I can act with it now.`;
