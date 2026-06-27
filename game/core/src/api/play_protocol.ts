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
} as const;

export type PlayActionTypeValue = (typeof PlayActionType)[keyof typeof PlayActionType];

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
    upNext: string[];
    damageStats: PlayDamageStatistic[];
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
    public float32(): number {
        const end = this.offset + 4;
        if (end > this.bytes.length) {
            throw new Error("Unexpected end of protobuf float");
        }
        const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getFloat32(0, true);
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
            cell.x = reader.varintNumber();
        } else if (field === 2) {
            cell.y = reader.varintNumber();
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
        upNext: [],
        damageStats: [],
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
            unit.morale = reader.varintNumber();
        } else if (field === 15) {
            unit.dead = reader.bool();
        } else if (field === 16) {
            unit.placed = reader.bool();
        } else if (field === 17) {
            unit.stackPower = reader.varintNumber();
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
