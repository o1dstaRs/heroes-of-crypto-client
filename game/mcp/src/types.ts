import type { GameAction, GameActionRejectionReason, GameEvent } from "@heroesofcrypto/common";

export type TeamName = "LOWER" | "UPPER";
export type AIReason =
    | "sandbox_toggle"
    | "pc_opponent"
    | "opponent_timeout"
    | "opponent_disconnected"
    | "server_bot"
    | "benchmark";
export type AIStyle = "balanced" | "aggressive" | "defensive";

export type DraftPhaseName = "initial_pick" | "extended_pick" | "extended_ban" | "pick" | "ban" | "complete";
export type DraftActionKind = "pick_initial_pair" | "pick_unit" | "ban_unit" | "reveal";

export interface DraftCreatureState {
    id: number;
    name: string;
    faction: string;
    level: number;
    size: number;
    hp: number;
    speed: number;
    steps: number;
    armor: number;
    attackType: string;
    attack: number;
    damage: { min: number; max: number };
    attackRange: number;
    rangeShots: number;
    shotDistance: number;
    magicResist: number;
    movementType: string;
    spells: string[];
    abilities: string[];
    draftValue: number;
}

export interface DraftTeamState {
    team: TeamName;
    picked: DraftCreatureState[];
    revealsRemaining: number;
}

export interface PublicDraftState {
    matchId: string;
    stateVersion: number;
    phase: "draft" | "complete";
    draftPhase: DraftPhaseName;
    activeTeams: TeamName[];
    requiredLevel?: number;
    initialCreaturePairs: Array<[DraftCreatureState, DraftCreatureState]>;
    banned: DraftCreatureState[];
    lower: DraftTeamState;
    upper: DraftTeamState;
    completedMatchId?: string;
}

export interface DraftAction {
    id: string;
    kind: DraftActionKind;
    team: TeamName;
    summary: string;
    pairIndex?: number;
    creatureId?: number;
    creatureIds?: number[];
    targetLevel?: number;
    tacticalTags: string[];
    risks: string[];
    evaluation: {
        value: number;
        level?: number;
        faction?: string;
        role?: string;
        deniesOpponent?: boolean;
        notes: string[];
    };
}

export interface EvaluatedDraftAction extends DraftAction {
    rank: number;
    score: number;
}

export interface AIDraftRequest {
    matchId: string;
    reason: AIReason;
    style?: AIStyle;
    state: PublicDraftState;
    legalActions: DraftAction[];
    team: TeamName;
}

export interface AIDraftDecision {
    actionId: string;
    action: DraftAction;
    confidence: number;
    explanation: string;
}

export interface SubmitDraftActionResult {
    completed: boolean;
    message?: string;
    state: PublicDraftState;
    nextLegalActions: DraftAction[];
    completedMatch?: PublicMatchState;
}

export interface PlayAiDraftResult {
    completed: boolean;
    team?: TeamName;
    stoppedReason: "draft_complete" | "wrong_team" | "no_legal_actions" | "action_rejected" | "max_actions";
    decisions: AIDraftDecision[];
    actionResults: SubmitDraftActionResult[];
    state: PublicDraftState;
    completedMatch?: PublicMatchState;
}

export interface PublicUnitState {
    id: string;
    name: string;
    team: TeamName;
    faction: string;
    level: number;
    size: number;
    cells: Array<{ x: number; y: number }>;
    hp: number;
    maxHp: number;
    amountAlive: number;
    amountDied: number;
    attackType: string;
    selectedAttackType: string;
    possibleAttackTypes: string[];
    movementType: string;
    speed: number;
    steps: number;
    morale: number;
    luck: number;
    stackPower: number;
    rangeShots: number;
    abilities: string[];
    spells: Array<{ name: string; remaining: number }>;
    buffs: string[];
    debuffs: string[];
}

export interface PublicMatchState {
    matchId: string;
    stateVersion: number;
    phase: "placement" | "fight" | "finished";
    grid: {
        type: string;
        size: number;
        currentLap: number;
        narrowedLayers: number;
    };
    activeUnitId?: string;
    activeTeam?: TeamName;
    winner?: TeamName;
    units: PublicUnitState[];
    turnOrderPreview: string[];
    lastEvents: GameEvent[];
}

export interface LegalAction {
    id: string;
    kind: GameAction["type"];
    team: TeamName;
    unitId?: string;
    summary: string;
    action: GameAction;
    tacticalTags: string[];
    risks: string[];
    evaluation?: {
        targetId?: string;
        targetName?: string;
        targetValue?: number;
        priorityScore?: number;
        spell?: {
            name: string;
            targetType: string;
            powerType: string;
            power: number;
            laps: number;
            remaining: number;
            isBuff: boolean;
            isMass: boolean;
            isSummon: boolean;
            estimatedValue: number;
        };
        damage?: {
            min: number;
            max: number;
            targetTotalHp: number;
            killsTarget: boolean;
        };
        retaliation?: boolean;
        notes?: string[];
    };
}

export interface EvaluatedLegalAction extends LegalAction {
    rank: number;
    score: number;
}

export interface AITurnRequest {
    matchId: string;
    reason: AIReason;
    style?: AIStyle;
    state: PublicMatchState;
    legalActions: LegalAction[];
    team: TeamName;
}

export interface AITurnDecision {
    actionId: string;
    action: GameAction;
    confidence: number;
    explanation: string;
}

export interface SubmitActionResult {
    completed: boolean;
    rejectionReason?: GameActionRejectionReason;
    message?: string;
    events: GameEvent[];
    state: PublicMatchState;
    nextLegalActions: LegalAction[];
}

export interface PlayAiTurnResult {
    completed: boolean;
    team?: TeamName;
    stoppedReason:
        | "turn_changed"
        | "fight_finished"
        | "no_active_unit"
        | "wrong_team"
        | "no_legal_actions"
        | "action_rejected"
        | "max_actions";
    decisions: AITurnDecision[];
    actionResults: SubmitActionResult[];
    state: PublicMatchState;
}

export interface GameAIPlayer {
    chooseAction(request: AITurnRequest): AITurnDecision | Promise<AITurnDecision>;
}
