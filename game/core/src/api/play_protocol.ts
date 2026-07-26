export const PlayPhase = {
    UNKNOWN: 0,
    PLACEMENT: 1,
    PLAY: 2,
    FINISHED: 3,
    ABANDONED: 4,
} as const;

export type PlayPhaseValue = (typeof PlayPhase)[keyof typeof PlayPhase];

export const PlayActionType = {
    UNKNOWN: 0,
    PLACE_UNIT: 1,
    START_FIGHT: 2,
    END_TURN: 3,
    WAIT_TURN: 4,
    DEFEND_TURN: 5,
    SELECT_ATTACK_TYPE: 6,
    MOVE_UNIT: 7,
    MELEE_ATTACK: 8,
    RANGE_ATTACK: 9,
    OBSTACLE_ATTACK: 10,
    AREA_THROW_ATTACK: 11,
    CAST_SPELL: 12,
    DELETE_UNIT: 13,
    READY_PLACEMENT: 14,
    PING: 15,
    SPLIT_UNIT: 16,
    MOVE_INTENT: 17,
    UNPLACE_UNIT: 18,
    REQUEST_ADDITIONAL_TIME: 19,
    AUGMENT: 20,
    ABANDON: 21,
    SYNERGY: 22,
} as const;

export type PlayActionTypeValue = (typeof PlayActionType)[keyof typeof PlayActionType];

// Existing `reason` field sentinel used only on MOVE_UNIT. It is intentionally not a new protobuf field:
// old clients retain move-is-the-turn behavior, while a new client can request one planned follow-up.
export const PLAY_MOVE_CONTINUE_TURN_REASON = "continue_turn";

export const PlayEventKind = {
    UNKNOWN: 0,
    SNAPSHOT: 1,
    ACTION_ACCEPTED: 2,
    ACTION_REJECTED: 3,
    PLAYER_CONNECTED: 4,
    PLAYER_DISCONNECTED: 5,
    AI_TAKEOVER: 6,
    PLACEMENT_TIMER_STARTED: 7,
    FIGHT_STARTED: 8,
    HEARTBEAT: 9,
    MOVE_INTENT: 10,
} as const;

export type PlayEventKindValue = (typeof PlayEventKind)[keyof typeof PlayEventKind];

export interface PlayCell {
    x: number;
    y: number;
}

export interface PlayPlayerState {
    playerId: string;
    team: number;
    connected: boolean;
    aiControlled: boolean;
    lastSeenMs: number;
}

export interface PlayUnitState {
    id: string;
    team: number;
    name: string;
    creatureId: number;
    amountAlive: number;
    amountDied: number;
    hp: number;
    maxHp: number;
    attackType: number;
    size: number;
    baseCell: PlayCell;
    cells: PlayCell[];
    speed: number;
    morale: number;
    dead: boolean;
    placed: boolean;
    stackPower: number;
    /** Remaining ranged shots, 1-based on the wire (count + 1) so a real "0 shots left" survives
     * proto3's zero-default; 0/absent means unknown (older server). Subtract 1 for the live count. */
    rangeShots: number;
    /** Authoritative effective luck (base + per-turn roll + auras), so the sidebar matches the server
     * instead of the client re-rolling its own divergent spread. Can be negative. */
    luck: number;
    /** Whether the unit is waiting on the hourglass, so clients show the hourglass icon. */
    onHourglass: boolean;
    /** Names of debuffs currently active on the unit; used to animate newly-applied ones. */
    debuffs?: string[];
    /** Remaining laps per debuff/effect, parallel to `debuffs` — drives the ranked HUD's debuff list. */
    debuffLaps?: number[];
    /** Display-ready description per debuff/effect, parallel to `debuffs` (power already substituted in). */
    debuffDescriptions?: string[];
    /** Names of buffs currently active on the unit; used to animate newly-applied ones. */
    buffs?: string[];
    /** Remaining laps per buff, parallel to `buffs` — drives the ranked HUD's buff list. */
    buffLaps?: number[];
    /** Display-ready description per buff, parallel to `buffs` (power already substituted in). */
    buffDescriptions?: string[];
    /** True if the unit already retaliated (replied) this lap — drives the respond tag. */
    responded?: boolean;
    /** True if the unit already used its hourglass (wait) this lap — disables the Wait button in ranked
     * (the client's FightProperties hourglass state isn't authoritative there). */
    hasHourglassed?: boolean;
    /** True if the unit is skipping this turn (Stun/Blindness) — drives the stun icon in ranked (the
     * effect itself isn't synced, so this is the only source there). */
    skipping?: boolean;
    /** Aggr forced target: the unit id this unit is compelled to attack (empty = none). Kept across
     * board rebuilds so the client never draws attack arrows to other targets. */
    forcedTargetId?: string;
    /** Remaining casts (scrolls) per spell in the unit's spellbook, in getSpells() order — lets ranked
     * sync used-up scroll counts (the client never runs the cast engine). */
    spellAmounts?: number[];
    /** The unit's LIVE ability names. Ranked rebuilds each unit from the base creature config (which lists
     * every ability), so this lets the client drop a consumable ability (e.g. Angel's Resurrection) — and
     * its ability-derived spellbook entry — once the server has spent it. */
    abilities?: string[];
    /** Ability names permanently removed by Predatory Assimilation (proto field 33). */
    stolenAbilities?: string[];
    /** Whether Web Aura locked this unit's movement at the start of its current turn (proto field 34). */
    webMovementLocked: boolean;
    /** Exact remaining spell entries (duplicates are remaining casts), authoritative when field 36 is true. */
    spellEntries?: string[];
    /** Distinguishes an authoritative empty spellbook from a legacy server that omitted field 35. */
    spellEntriesAuthoritative: boolean;
}

export interface PlayJournalEntry {
    sequence: number;
    actionId: string;
    playerId: string;
    team: number;
    actionType: PlayActionTypeValue;
    actionJson: string;
    eventsJson: string;
    acceptedAtMs: number;
}

export interface PlayDamageStatistic {
    unitName: string;
    damage: number;
    team: number;
    lap: number;
}

export interface PlaySnapshot {
    gameId: string;
    phase: PlayPhaseValue;
    gridType: number;
    currentLap: number;
    fightStarted: boolean;
    fightFinished: boolean;
    currentUnitId: string;
    currentTurnTeam: number;
    latestSequence: number;
    serverTimeMs: number;
    placementDeadlineMs: number;
    // Split-placement sub-stage: 0 = Setup (augments/synergies), 1 = Board (positioning). Always 1 for a
    // legacy single-window placement. `placementSplit` gates the two-stage UX. Default 1/false on older
    // servers (decoder), i.e. the combined placement.
    placementStage: number;
    placementSplit: boolean;
    currentTurnStartMs: number;
    currentTurnEndMs: number;
    units: PlayUnitState[];
    players: PlayPlayerState[];
    readyPlayerIds: string[];
    journalTail: PlayJournalEntry[];
    maxLowerUnits: number;
    maxUpperUnits: number;
    narrowingLayers: number;
    centerDried: boolean;
    /** Server-authoritative cumulative multiplier applied to morale when deriving movement steps. */
    stepsMoraleMultiplier?: number;
    upNext: string[];
    damageStats: PlayDamageStatistic[];
    /** Each team's army totals captured at fight start (units + cumulative HP), so the fight-results
     * overlay can render casualty stats for a team that's later fully wiped. 0 before fight start;
     * absent from older servers (the decoder still defaults them to 0). */
    lowerStartUnits?: number;
    upperStartUnits?: number;
    lowerStartHealth?: number;
    upperStartHealth?: number;
    /** Army-wide artifacts picked per team (Tier1Artifact/Tier2Artifact enum ids; 0 = none), so the
     * placement UI can render each side's picked artifacts. Absent from older servers (decoder defaults
     * to 0). */
    lowerArtifactTier1?: number;
    lowerArtifactTier2?: number;
    upperArtifactTier1?: number;
    upperArtifactTier2?: number;
    /** Each team's perk (Perk enum id; 0 = none) — the placement sidebar derives the upgrade-point budget.
     * The opponent's is hidden (0) until the fight starts. Absent from older servers (decoder defaults 0). */
    lowerPerk?: number;
    upperPerk?: number;
    /** Placement-time army augments picked per team (augment level enum ids; 0 = none). Opponent values are
     * hidden (0) during placement, revealed at fight start (same as artifacts). */
    lowerAugmentPlacement?: number;
    lowerAugmentArmor?: number;
    lowerAugmentMight?: number;
    lowerAugmentSniper?: number;
    lowerAugmentMovement?: number;
    upperAugmentPlacement?: number;
    upperAugmentArmor?: number;
    upperAugmentMight?: number;
    upperAugmentSniper?: number;
    upperAugmentMovement?: number;
    /** Each team's selected synergies (keys like "Might:2:1"). Only populated once the fight has started
     * (empty during placement, for both teams) — the ranked HUD shows them top-left. Absent from older
     * servers (decoder defaults to []). */
    lowerSynergies?: string[];
    upperSynergies?: string[];
    /** Each team's starting army broken down per creature type, captured once at fight start and never
     * pruned afterward — unlike `units`, which only ever lists CURRENTLY-existing stacks (a fully-wiped
     * stack is removed server-side and never reappears in a later snapshot). Parallel arrays:
     * creatureIds[i] fielded in amounts[i]. Lets a cold-loaded/reloaded finished game render a correct
     * per-creature casualty breakdown even for a team that lost an entire creature type. Empty before
     * the fight starts; absent from older servers (decoder defaults to []). */
    lowerStartRosterCreatureIds?: number[];
    lowerStartRosterAmounts?: number[];
    upperStartRosterCreatureIds?: number[];
    upperStartRosterAmounts?: number[];
}

export interface PlayAction {
    actionId: string;
    gameId: string;
    playerId: string;
    expectedSequence: number;
    type: PlayActionTypeValue;
    unitId?: string;
    targetUnitId?: string;
    team?: number;
    unitName?: string;
    cells?: PlayCell[];
    path?: PlayCell[];
    targetCells?: PlayCell[];
    attackFrom?: PlayCell;
    targetCell?: PlayCell;
    // Ranged aim: 1-based cell side the shot is aimed at (1=LEFT,2=RIGHT,3=DOWN,4=UP; 0/undefined =
    // none). 1-based so side LEFT (0) survives the varint zero-skip. Paired with targetCell (aimCell).
    targetSide?: number;
    attackType?: number;
    spellName?: string;
    hasLavaCell?: boolean;
    hasWaterCell?: boolean;
    reason?: string;
    amount?: number;
}

export interface PlayIntent {
    unitId: string;
    targetCell?: PlayCell;
    active: boolean;
}

export interface PlayEvent {
    sequence: number;
    kind: PlayEventKindValue;
    gameId: string;
    playerId: string;
    snapshot?: PlaySnapshot;
    journalEntry?: PlayJournalEntry;
    rejectionReason: string;
    message: string;
    serverTimeMs: number;
    intent?: PlayIntent;
}

export interface PlayActionResponse {
    accepted: boolean;
    actionId: string;
    sequence: number;
    rejectionReason: string;
    message: string;
    event?: PlayEvent;
}

export interface DevCreatePlayGameRequest {
    lowerPlayerId?: string;
    upperPlayerId?: string;
    lowerCreatureIds?: number[];
    upperCreatureIds?: number[];
    unitAmount?: number;
    placementSeconds?: number;
    gridType?: number;
}

export interface DevCreatePlayGameResponse {
    gameId: string;
    snapshot?: PlaySnapshot;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class ProtoWriter {
    private readonly bytes: number[] = [];
    public finish(): Uint8Array {
        return new Uint8Array(this.bytes);
    }
    public string(field: number, value?: string): void {
        if (!value) {
            return;
        }
        const encoded = textEncoder.encode(value);
        this.tag(field, 2);
        this.varint(encoded.length);
        this.pushBytes(encoded);
    }
    public int32(field: number, value?: number): void {
        if (!Number.isFinite(value ?? 0) || !value) {
            return;
        }
        this.tag(field, 0);
        this.varint(Math.trunc(value));
    }
    public uint64(field: number, value?: number): void {
        if (!Number.isFinite(value ?? 0) || !value) {
            return;
        }
        this.tag(field, 0);
        this.varint(BigInt(Math.trunc(value)));
    }
    public bool(field: number, value?: boolean): void {
        if (!value) {
            return;
        }
        this.tag(field, 0);
        this.varint(1);
    }
    public message(field: number, value: Uint8Array): void {
        this.tag(field, 2);
        this.varint(value.length);
        this.pushBytes(value);
    }
    private tag(field: number, wireType: number): void {
        this.varint((field << 3) | wireType);
    }
    private varint(value: number | bigint): void {
        let nextValue = BigInt(value);
        // A negative int32/int64 is encoded as its 64-bit two's-complement — a full 10-byte varint — per
        // the protobuf spec (protobufjs and the server's decoder both expect this). Without the mask a
        // negative number never exceeds 0x7f, so the loop is skipped and it's emitted as ONE corrupt byte.
        // That silently broke every value that can go negative on the wire — notably a left-mountain's
        // negative world-X in an OBSTACLE_ATTACK's target cell, so ranked mountain hits never landed.
        if (nextValue < 0n) {
            nextValue &= 0xffffffffffffffffn;
        }
        while (nextValue > 0x7fn) {
            this.bytes.push(Number((nextValue & 0x7fn) | 0x80n));
            nextValue >>= 7n;
        }
        this.bytes.push(Number(nextValue));
    }
    private pushBytes(value: Uint8Array): void {
        for (const byte of value) {
            this.bytes.push(byte);
        }
    }
}

class ProtoReader {
    private offset = 0;
    public constructor(private readonly bytes: Uint8Array) {}
    public done(): boolean {
        return this.offset >= this.bytes.length;
    }
    public tag(): { field: number; wireType: number } {
        const tag = this.varintNumber();
        return { field: tag >> 3, wireType: tag & 7 };
    }
    public varintNumber(): number {
        return Number(this.varintBigInt());
    }
    // Signed int32 decode. protobufjs sign-extends negative int32 to a 10-byte varint, which the plain
    // varintNumber() above would surface as a huge positive number. Used for fields that can go negative
    // (morale, luck), so e.g. dismorale / negative luck render correctly on the left sidebar.
    public signedVarintNumber(): number {
        return Number(BigInt.asIntN(32, this.varintBigInt()));
    }
    public float32(): number {
        const end = this.offset + 4;
        if (end > this.bytes.length) {
            throw new Error("Unexpected end of protobuf float");
        }
        const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getFloat32(0, true);
        this.offset = end;
        return value;
    }
    public float64(): number {
        const end = this.offset + 8;
        if (end > this.bytes.length) {
            throw new Error("Unexpected end of protobuf double");
        }
        const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, true);
        this.offset = end;
        return value;
    }
    public bool(): boolean {
        return this.varintNumber() !== 0;
    }
    public string(): string {
        return textDecoder.decode(this.bytesValue());
    }
    public bytesValue(): Uint8Array {
        const length = this.varintNumber();
        const end = this.offset + length;
        if (end > this.bytes.length) {
            throw new Error("Invalid protobuf length");
        }
        const value = this.bytes.subarray(this.offset, end);
        this.offset = end;
        return value;
    }
    public skip(wireType: number): void {
        if (wireType === 0) {
            this.varintBigInt();
            return;
        }
        if (wireType === 1) {
            this.offset += 8;
            return;
        }
        if (wireType === 2) {
            this.offset += this.varintNumber();
            return;
        }
        if (wireType === 5) {
            this.offset += 4;
            return;
        }
        throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
    private varintBigInt(): bigint {
        let shift = 0n;
        let result = 0n;

        for (let index = 0; index < 10; index++) {
            if (this.offset >= this.bytes.length) {
                throw new Error("Unexpected end of protobuf varint");
            }
            const byte = BigInt(this.bytes[this.offset++] ?? 0);
            result |= (byte & 0x7fn) << shift;
            if ((byte & 0x80n) === 0n) {
                return result;
            }
            shift += 7n;
        }

        throw new Error("Protobuf varint is too long");
    }
}

const encodeCell = (cell: PlayCell): Uint8Array => {
    const writer = new ProtoWriter();
    writer.int32(1, cell.x);
    writer.int32(2, cell.y);
    return writer.finish();
};

const decodeCell = (bytes: Uint8Array): PlayCell => {
    const reader = new ProtoReader(bytes);
    const cell: PlayCell = { x: 0, y: 0 };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            // Cell coordinates can be negative world positions (a left-mountain OBSTACLE_ATTACK target,
            // whose world-X < 0), so decode as a signed int32 — varintNumber() would surface the
            // sign-extended 10-byte varint as a huge positive number.
            cell.x = reader.signedVarintNumber();
        } else if (field === 2) {
            cell.y = reader.signedVarintNumber();
        } else {
            reader.skip(wireType);
        }
    }
    return cell;
};

export const encodeDevCreatePlayGameRequest = (request: DevCreatePlayGameRequest): Uint8Array => {
    const writer = new ProtoWriter();
    writer.string(1, request.lowerPlayerId);
    writer.string(2, request.upperPlayerId);
    for (const creatureId of request.lowerCreatureIds ?? []) {
        writer.int32(3, creatureId);
    }
    for (const creatureId of request.upperCreatureIds ?? []) {
        writer.int32(4, creatureId);
    }
    writer.int32(5, request.unitAmount);
    writer.int32(6, request.placementSeconds);
    writer.int32(7, request.gridType);
    return writer.finish();
};

export const encodePlayAction = (action: PlayAction): Uint8Array => {
    const writer = new ProtoWriter();
    writer.string(1, action.actionId);
    writer.string(2, action.gameId);
    writer.string(3, action.playerId);
    writer.uint64(4, action.expectedSequence);
    writer.int32(5, action.type);
    writer.string(6, action.unitId);
    writer.string(7, action.targetUnitId);
    writer.int32(8, action.team);
    writer.string(9, action.unitName);
    for (const cell of action.cells ?? []) {
        writer.message(10, encodeCell(cell));
    }
    for (const cell of action.path ?? []) {
        writer.message(11, encodeCell(cell));
    }
    for (const cell of action.targetCells ?? []) {
        writer.message(12, encodeCell(cell));
    }
    if (action.attackFrom) {
        writer.message(13, encodeCell(action.attackFrom));
    }
    if (action.targetCell) {
        writer.message(14, encodeCell(action.targetCell));
    }
    writer.int32(15, action.attackType);
    writer.string(16, action.spellName);
    writer.bool(17, action.hasLavaCell);
    writer.bool(18, action.hasWaterCell);
    writer.string(19, action.reason);
    writer.int32(20, action.amount);
    writer.int32(21, action.targetSide);
    return writer.finish();
};

export const decodeDevCreatePlayGameResponse = (bytes: Uint8Array): DevCreatePlayGameResponse => {
    const reader = new ProtoReader(bytes);
    const response: DevCreatePlayGameResponse = { gameId: "" };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            response.gameId = reader.string();
        } else if (field === 2) {
            response.snapshot = decodePlaySnapshot(reader.bytesValue());
        } else {
            reader.skip(wireType);
        }
    }
    return response;
};

export const decodePlayActionResponse = (bytes: Uint8Array): PlayActionResponse => {
    const reader = new ProtoReader(bytes);
    const response: PlayActionResponse = {
        accepted: false,
        actionId: "",
        sequence: 0,
        rejectionReason: "",
        message: "",
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            response.accepted = reader.bool();
        } else if (field === 2) {
            response.actionId = reader.string();
        } else if (field === 3) {
            response.sequence = reader.varintNumber();
        } else if (field === 4) {
            response.rejectionReason = reader.string();
        } else if (field === 5) {
            response.message = reader.string();
        } else if (field === 6) {
            response.event = decodePlayEvent(reader.bytesValue());
        } else {
            reader.skip(wireType);
        }
    }
    return response;
};

export const decodePlayEvent = (bytes: Uint8Array): PlayEvent => {
    const reader = new ProtoReader(bytes);
    const event: PlayEvent = {
        sequence: 0,
        kind: PlayEventKind.UNKNOWN,
        gameId: "",
        playerId: "",
        rejectionReason: "",
        message: "",
        serverTimeMs: 0,
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            event.sequence = reader.varintNumber();
        } else if (field === 2) {
            event.kind = reader.varintNumber() as PlayEventKindValue;
        } else if (field === 3) {
            event.gameId = reader.string();
        } else if (field === 4) {
            event.playerId = reader.string();
        } else if (field === 5) {
            event.snapshot = decodePlaySnapshot(reader.bytesValue());
        } else if (field === 6) {
            event.journalEntry = decodeJournalEntry(reader.bytesValue());
        } else if (field === 7) {
            event.rejectionReason = reader.string();
        } else if (field === 8) {
            event.message = reader.string();
        } else if (field === 9) {
            event.serverTimeMs = reader.varintNumber();
        } else if (field === 10) {
            event.intent = decodePlayIntent(reader.bytesValue());
        } else {
            reader.skip(wireType);
        }
    }
    return event;
};

const decodePlayIntent = (bytes: Uint8Array): PlayIntent => {
    const reader = new ProtoReader(bytes);
    const intent: PlayIntent = { unitId: "", active: false };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            intent.unitId = reader.string();
        } else if (field === 2) {
            intent.targetCell = decodeCell(reader.bytesValue());
        } else if (field === 3) {
            intent.active = reader.bool();
        } else {
            reader.skip(wireType);
        }
    }
    return intent;
};

export const decodePlaySnapshot = (bytes: Uint8Array): PlaySnapshot => {
    const reader = new ProtoReader(bytes);
    const snapshot: PlaySnapshot = {
        gameId: "",
        phase: PlayPhase.UNKNOWN,
        gridType: 0,
        currentLap: 0,
        fightStarted: false,
        fightFinished: false,
        currentUnitId: "",
        currentTurnTeam: 0,
        latestSequence: 0,
        serverTimeMs: 0,
        placementDeadlineMs: 0,
        // MUST default to 0: protobuf omits an int32 whose value is 0, so a split game's SETUP stage
        // (placement_stage = 0) arrives with field 50 ABSENT — decoding it as anything but 0 would make
        // the client think Setup is Board (hiding augments, letting the server reject every placement).
        // Legacy (non-split) games are unaffected: placement_split defaults false, and every stage gate
        // (inSetupStage/inBoardStage) requires placementSplit, so stage is ignored there. A legacy/current
        // server on the BOARD stage sends placement_stage = 1 explicitly (1 != 0, so it IS on the wire).
        placementStage: 0,
        placementSplit: false,
        currentTurnStartMs: 0,
        currentTurnEndMs: 0,
        units: [],
        players: [],
        readyPlayerIds: [],
        journalTail: [],
        maxLowerUnits: 0,
        maxUpperUnits: 0,
        narrowingLayers: 0,
        centerDried: false,
        stepsMoraleMultiplier: 0,
        upNext: [],
        damageStats: [],
        lowerStartUnits: 0,
        upperStartUnits: 0,
        lowerStartHealth: 0,
        upperStartHealth: 0,
        lowerArtifactTier1: 0,
        lowerArtifactTier2: 0,
        upperArtifactTier1: 0,
        upperArtifactTier2: 0,
        lowerPerk: 0,
        upperPerk: 0,
        lowerAugmentPlacement: 0,
        lowerAugmentArmor: 0,
        lowerAugmentMight: 0,
        lowerAugmentSniper: 0,
        lowerAugmentMovement: 0,
        upperAugmentPlacement: 0,
        upperAugmentArmor: 0,
        upperAugmentMight: 0,
        upperAugmentSniper: 0,
        upperAugmentMovement: 0,
        lowerSynergies: [],
        upperSynergies: [],
        lowerStartRosterCreatureIds: [],
        lowerStartRosterAmounts: [],
        upperStartRosterCreatureIds: [],
        upperStartRosterAmounts: [],
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            snapshot.gameId = reader.string();
        } else if (field === 2) {
            snapshot.phase = reader.varintNumber() as PlayPhaseValue;
        } else if (field === 3) {
            snapshot.gridType = reader.varintNumber();
        } else if (field === 4) {
            snapshot.currentLap = reader.varintNumber();
        } else if (field === 5) {
            snapshot.fightStarted = reader.bool();
        } else if (field === 6) {
            snapshot.fightFinished = reader.bool();
        } else if (field === 7) {
            snapshot.currentUnitId = reader.string();
        } else if (field === 8) {
            snapshot.currentTurnTeam = reader.varintNumber();
        } else if (field === 9) {
            snapshot.latestSequence = reader.varintNumber();
        } else if (field === 10) {
            snapshot.serverTimeMs = reader.varintNumber();
        } else if (field === 11) {
            snapshot.placementDeadlineMs = reader.varintNumber();
        } else if (field === 12) {
            snapshot.units.push(decodeUnitState(reader.bytesValue()));
        } else if (field === 13) {
            snapshot.players.push(decodePlayerState(reader.bytesValue()));
        } else if (field === 14) {
            snapshot.readyPlayerIds.push(reader.string());
        } else if (field === 15) {
            snapshot.journalTail.push(decodeJournalEntry(reader.bytesValue()));
        } else if (field === 16) {
            snapshot.maxLowerUnits = reader.varintNumber();
        } else if (field === 17) {
            snapshot.maxUpperUnits = reader.varintNumber();
        } else if (field === 18) {
            snapshot.narrowingLayers = reader.varintNumber();
        } else if (field === 19) {
            snapshot.centerDried = reader.bool();
        } else if (field === 20) {
            snapshot.upNext.push(reader.string());
        } else if (field === 21) {
            snapshot.damageStats.push(decodeDamageStatistic(reader.bytesValue()));
        } else if (field === 22) {
            snapshot.currentTurnStartMs = reader.varintNumber();
        } else if (field === 23) {
            snapshot.currentTurnEndMs = reader.varintNumber();
        } else if (field === 24) {
            snapshot.lowerStartUnits = reader.varintNumber();
        } else if (field === 25) {
            snapshot.upperStartUnits = reader.varintNumber();
        } else if (field === 26) {
            snapshot.lowerStartHealth = reader.varintNumber();
        } else if (field === 27) {
            snapshot.upperStartHealth = reader.varintNumber();
        } else if (field === 28) {
            snapshot.lowerArtifactTier1 = reader.varintNumber();
        } else if (field === 29) {
            snapshot.lowerArtifactTier2 = reader.varintNumber();
        } else if (field === 30) {
            snapshot.upperArtifactTier1 = reader.varintNumber();
        } else if (field === 31) {
            snapshot.upperArtifactTier2 = reader.varintNumber();
        } else if (field === 32) {
            snapshot.lowerPerk = reader.varintNumber();
        } else if (field === 33) {
            snapshot.upperPerk = reader.varintNumber();
        } else if (field === 34) {
            snapshot.lowerAugmentPlacement = reader.varintNumber();
        } else if (field === 35) {
            snapshot.lowerAugmentArmor = reader.varintNumber();
        } else if (field === 36) {
            snapshot.lowerAugmentMight = reader.varintNumber();
        } else if (field === 37) {
            snapshot.lowerAugmentSniper = reader.varintNumber();
        } else if (field === 38) {
            snapshot.lowerAugmentMovement = reader.varintNumber();
        } else if (field === 39) {
            snapshot.upperAugmentPlacement = reader.varintNumber();
        } else if (field === 40) {
            snapshot.upperAugmentArmor = reader.varintNumber();
        } else if (field === 41) {
            snapshot.upperAugmentMight = reader.varintNumber();
        } else if (field === 42) {
            snapshot.upperAugmentSniper = reader.varintNumber();
        } else if (field === 43) {
            snapshot.upperAugmentMovement = reader.varintNumber();
        } else if (field === 44) {
            // repeated string: each occurrence is one synergy key ("Faction:synergy:level").
            (snapshot.lowerSynergies ??= []).push(reader.string());
        } else if (field === 45) {
            (snapshot.upperSynergies ??= []).push(reader.string());
        } else if (field === 46) {
            (snapshot.lowerStartRosterCreatureIds ??= []).push(reader.varintNumber());
        } else if (field === 47) {
            (snapshot.lowerStartRosterAmounts ??= []).push(reader.varintNumber());
        } else if (field === 48) {
            (snapshot.upperStartRosterCreatureIds ??= []).push(reader.varintNumber());
        } else if (field === 49) {
            (snapshot.upperStartRosterAmounts ??= []).push(reader.varintNumber());
        } else if (field === 50) {
            snapshot.placementStage = reader.varintNumber();
        } else if (field === 51) {
            snapshot.placementSplit = reader.bool();
        } else if (field === 52) {
            snapshot.stepsMoraleMultiplier = reader.float64();
        } else {
            reader.skip(wireType);
        }
    }
    return snapshot;
};

const decodeUnitState = (bytes: Uint8Array): PlayUnitState => {
    const reader = new ProtoReader(bytes);
    const unit: PlayUnitState = {
        id: "",
        team: 0,
        name: "",
        creatureId: 0,
        amountAlive: 0,
        amountDied: 0,
        hp: 0,
        maxHp: 0,
        attackType: 0,
        size: 0,
        baseCell: { x: 0, y: 0 },
        cells: [],
        speed: 0,
        morale: 0,
        dead: false,
        placed: false,
        stackPower: 0,
        rangeShots: 0,
        luck: 0,
        onHourglass: false,
        webMovementLocked: false,
        spellEntriesAuthoritative: false,
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            unit.id = reader.string();
        } else if (field === 2) {
            unit.team = reader.varintNumber();
        } else if (field === 3) {
            unit.name = reader.string();
        } else if (field === 4) {
            unit.creatureId = reader.varintNumber();
        } else if (field === 5) {
            unit.amountAlive = reader.varintNumber();
        } else if (field === 6) {
            unit.amountDied = reader.varintNumber();
        } else if (field === 7) {
            unit.hp = reader.varintNumber();
        } else if (field === 8) {
            unit.maxHp = reader.varintNumber();
        } else if (field === 9) {
            unit.attackType = reader.varintNumber();
        } else if (field === 10) {
            unit.size = reader.varintNumber();
        } else if (field === 11) {
            unit.baseCell = decodeCell(reader.bytesValue());
        } else if (field === 12) {
            unit.cells.push(decodeCell(reader.bytesValue()));
        } else if (field === 13) {
            unit.speed = wireType === 5 ? reader.float32() : reader.varintNumber();
        } else if (field === 14) {
            unit.morale = reader.signedVarintNumber();
        } else if (field === 15) {
            unit.dead = reader.bool();
        } else if (field === 16) {
            unit.placed = reader.bool();
        } else if (field === 17) {
            unit.stackPower = reader.varintNumber();
        } else if (field === 18) {
            (unit.debuffs ??= []).push(reader.string());
        } else if (field === 19) {
            (unit.buffs ??= []).push(reader.string());
        } else if (field === 20) {
            unit.rangeShots = reader.varintNumber();
        } else if (field === 21) {
            unit.luck = reader.signedVarintNumber();
        } else if (field === 22) {
            unit.onHourglass = reader.bool();
        } else if (field === 23) {
            unit.responded = reader.bool();
        } else if (field === 24) {
            unit.hasHourglassed = reader.bool();
        } else if (field === 25) {
            unit.skipping = reader.bool();
        } else if (field === 26) {
            // debuff_laps (packed=false): one varint per active debuff/effect, parallel to `debuffs`.
            (unit.debuffLaps ??= []).push(reader.varintNumber());
        } else if (field === 27) {
            // debuff_descriptions: display-ready string per active debuff/effect, parallel to `debuffs`.
            (unit.debuffDescriptions ??= []).push(reader.string());
        } else if (field === 28) {
            unit.forcedTargetId = reader.string();
        } else if (field === 29) {
            // spell_amounts (packed=false): one varint per spell in the unit's spellbook (getSpells() order).
            (unit.spellAmounts ??= []).push(reader.varintNumber());
        } else if (field === 30) {
            // abilities: one string per live ability name (see PlayUnit.abilities).
            (unit.abilities ??= []).push(reader.string());
        } else if (field === 31) {
            // buff_laps (packed=false): one varint per active buff, parallel to `buffs`.
            (unit.buffLaps ??= []).push(reader.varintNumber());
        } else if (field === 32) {
            // buff_descriptions: display-ready string per active buff, parallel to `buffs`.
            (unit.buffDescriptions ??= []).push(reader.string());
        } else if (field === 33) {
            // stolen_abilities: permanently disabled abilities retained for the target unit's HUD.
            (unit.stolenAbilities ??= []).push(reader.string());
        } else if (field === 34) {
            // web_movement_locked: authoritative turn-start movement lock from an enemy Web Aura.
            unit.webMovementLocked = reader.bool();
        } else if (field === 35) {
            // spell_entries: exact remaining `${faction}:${name}` entries; duplicates encode casts.
            (unit.spellEntries ??= []).push(reader.string());
        } else if (field === 36) {
            // Presence marker so an empty authoritative spellbook differs from an older server.
            unit.spellEntriesAuthoritative = reader.bool();
        } else {
            reader.skip(wireType);
        }
    }
    return unit;
};

const decodePlayerState = (bytes: Uint8Array): PlayPlayerState => {
    const reader = new ProtoReader(bytes);
    const player: PlayPlayerState = {
        playerId: "",
        team: 0,
        connected: false,
        aiControlled: false,
        lastSeenMs: 0,
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            player.playerId = reader.string();
        } else if (field === 2) {
            player.team = reader.varintNumber();
        } else if (field === 3) {
            player.connected = reader.bool();
        } else if (field === 4) {
            player.aiControlled = reader.bool();
        } else if (field === 5) {
            player.lastSeenMs = reader.varintNumber();
        } else {
            reader.skip(wireType);
        }
    }
    return player;
};

const decodeDamageStatistic = (bytes: Uint8Array): PlayDamageStatistic => {
    const reader = new ProtoReader(bytes);
    const stat: PlayDamageStatistic = {
        unitName: "",
        damage: 0,
        team: 0,
        lap: 0,
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            stat.unitName = reader.string();
        } else if (field === 2) {
            stat.damage = reader.varintNumber();
        } else if (field === 3) {
            stat.team = reader.varintNumber();
        } else if (field === 4) {
            stat.lap = reader.varintNumber();
        } else {
            reader.skip(wireType);
        }
    }
    return stat;
};

const decodeJournalEntry = (bytes: Uint8Array): PlayJournalEntry => {
    const reader = new ProtoReader(bytes);
    const entry: PlayJournalEntry = {
        sequence: 0,
        actionId: "",
        playerId: "",
        team: 0,
        actionType: PlayActionType.UNKNOWN,
        actionJson: "",
        eventsJson: "",
        acceptedAtMs: 0,
    };
    while (!reader.done()) {
        const { field, wireType } = reader.tag();
        if (field === 1) {
            entry.sequence = reader.varintNumber();
        } else if (field === 2) {
            entry.actionId = reader.string();
        } else if (field === 3) {
            entry.playerId = reader.string();
        } else if (field === 4) {
            entry.team = reader.varintNumber();
        } else if (field === 5) {
            entry.actionType = reader.varintNumber() as PlayActionTypeValue;
        } else if (field === 6) {
            entry.actionJson = reader.string();
        } else if (field === 7) {
            entry.eventsJson = reader.string();
        } else if (field === 8) {
            entry.acceptedAtMs = reader.varintNumber();
        } else {
            reader.skip(wireType);
        }
    }
    return entry;
};

export const decodeSsePlayEvent = (data: string): PlayEvent => {
    const binary = atob(data.trim());
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return decodePlayEvent(bytes);
};
