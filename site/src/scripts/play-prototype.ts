import {
    GamePublic,
    PickBanRequest,
    PickPairRequest,
    ResponseEnqueue,
} from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";
import { CreatureByLevel } from "@heroesofcrypto/common/src/generated/protobuf/v1/creature_gen";

import {
    decodePlayActionResponse,
    decodePlaySnapshot,
    decodeSsePlayEvent,
    encodePlayAction,
    PlayActionType,
    type PlayActionTypeValue,
    PlayEventKind,
    PlayPhase,
    type PlaySnapshot,
    type PlayUnitState,
} from "../lib/play-protocol";

const TEAM_UPPER = 1;
const TEAM_LOWER = 2;
const UNIT_SIZE_LARGE = 2;
const GRID_SIZE = 16;
const LOG_LIMIT = 80;

const PickPhase = {
    INITIAL_PICK: 0,
    EXTENDED_PICK: 1,
    EXTENDED_BAN: 2,
    PICK: 3,
    BAN: 4,
    ARTIFACT_1: 5,
    ARTIFACT_2: 6,
    AUGMENTS: 7,
    AUGMENTS_SCOUT: 8,
} as const;

const CREATURE_NAMES: Record<number, string> = {
    1: "Orc",
    2: "Scavenger",
    3: "Troglodyte",
    4: "Troll",
    5: "Medusa",
    6: "Beholder",
    7: "Goblin Knight",
    8: "Efreet",
    9: "Black Dragon",
    10: "Hydra",
    11: "Centaur",
    12: "Berserker",
    13: "Wolf Rider",
    14: "Harpy",
    15: "Nomad",
    16: "Hyena",
    17: "Cyclops",
    18: "Ogre Mage",
    19: "Thunderbird",
    20: "Behemoth",
    21: "Wolf",
    22: "Fairy",
    23: "Leprechaun",
    24: "Elf",
    25: "White Tiger",
    26: "Satyr",
    27: "Mantis",
    28: "Unicorn",
    29: "Gargantuan",
    30: "Pegasus",
    31: "Peasant",
    32: "Squire",
    33: "Arbalester",
    34: "Valkyrie",
    35: "Pikeman",
    36: "Healer",
    37: "Griffin",
    38: "Crusader",
    39: "Tsar Cannon",
    40: "Angel",
};

interface MatchEvent {
    ps: string;
    po: number;
    r: number;
    c: number;
}

interface PickEvent {
    ip: [number, number][];
    pp: number;
    a: number[];
    p: number[];
    b: number[];
    op: number[];
    t: number;
    r: number;
    ia: boolean;
    ma: [number, number][];
    oa: number[];
}

interface StreamHandle {
    abort: AbortController;
    label: string;
}

interface ClientState {
    apiBase: string;
    token: string;
    gameId: string;
    playerId: string;
    lowerPlayerId: string;
    upperPlayerId: string;
    team: number;
    selectedUnitId: string;
    lastSequence: number;
    flow: "signed-out" | "idle" | "queue" | "confirm" | "pick" | "placement" | "play" | "finished";
    matchEvent?: MatchEvent;
    pickEvent?: PickEvent;
    snapshot?: PlaySnapshot;
    streams: StreamHandle[];
    logs: string[];
}

const byId = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing #${id}`);
    }
    return element as T;
};

const apiBaseInput = byId<HTMLInputElement>("play-api-base");
const authLink = byId<HTMLAnchorElement>("play-auth-link");
const createButton = byId<HTMLButtonElement>("play-create");
const acceptButton = byId<HTMLButtonElement>("play-accept");
const cancelQueueButton = byId<HTMLButtonElement>("play-cancel-queue");
const connectButton = byId<HTMLButtonElement>("play-connect");
const refreshButton = byId<HTMLButtonElement>("play-refresh");
const readyButton = byId<HTMLButtonElement>("play-ready");
const endTurnButton = byId<HTMLButtonElement>("play-end-turn");
const copyLowerButton = byId<HTMLButtonElement>("play-copy-lower");
const copyUpperButton = byId<HTMLButtonElement>("play-copy-upper");
const openLowerLink = byId<HTMLAnchorElement>("play-open-lower");
const openUpperLink = byId<HTMLAnchorElement>("play-open-upper");
const flowNode = byId<HTMLDivElement>("play-match-flow");
const statusNode = byId<HTMLDivElement>("play-status");
const phaseNode = byId<HTMLDivElement>("play-phase");
const deadlineNode = byId<HTMLDivElement>("play-deadline");
const seatNode = byId<HTMLDivElement>("play-seat");
const currentTurnNode = byId<HTMLDivElement>("play-current-turn");
const unitListNode = byId<HTMLDivElement>("play-unit-list");
const pickPanelNode = byId<HTMLDivElement>("play-pick-panel");
const boardNode = byId<HTMLDivElement>("play-board");
const logNode = byId<HTMLPreElement>("play-log");

const params = new URLSearchParams(window.location.search);
const isProd =
    import.meta.env.PROD ||
    import.meta.env.VITE_IS_PROD === "true" ||
    import.meta.env.VITE_IS_PROD === true;
const defaultApiBase =
    params.get("api") ??
    window.localStorage.getItem("hoc.play.apiBase") ??
    window.location.origin;

const state: ClientState = {
    apiBase: defaultApiBase,
    token: window.localStorage.getItem("accessToken") ?? "",
    gameId: params.get("game") ?? "",
    playerId: params.get("player") ?? "",
    lowerPlayerId: "",
    upperPlayerId: "",
    team: 0,
    selectedUnitId: "",
    lastSequence: 0,
    flow: "idle",
    streams: [],
    logs: [],
};

apiBaseInput.value = state.apiBase;

const apiUrl = (path: string): string => `${state.apiBase.replace(/\/$/, "")}${path}`;

const routes = {
    mmQueue: isProd ? "/v1/queue" : "/v1/mm/queue",
    mmEvents: isProd ? "/v1/events" : "/v1/mm/events",
    gameCurrent: isProd ? "/v1/current" : "/v1/game/current",
    gameConfirm: (gameId: string) => `${isProd ? "/v1/confirm" : "/v1/game/confirm"}/${encodeURIComponent(gameId)}`,
    pickEvents: (gameId: string) => `${isProd ? "/v1/pick-events" : "/v1/game/pick-events"}/${encodeURIComponent(gameId)}`,
    pickPair: isProd ? "/v1/pick-pair" : "/v1/game/pick-pair",
    pick: isProd ? "/v1/pick" : "/v1/game/pick",
    ban: isProd ? "/v1/ban" : "/v1/game/ban",
    playEvents: (gameId: string) => `${isProd ? "/v1/play-events" : "/v1/game/play-events"}/${encodeURIComponent(gameId)}`,
    playSnapshot: (gameId: string) => `${isProd ? "/v1/play-snapshot" : "/v1/game/play-snapshot"}/${encodeURIComponent(gameId)}`,
    playAction: (gameId: string) => `${isProd ? "/v1/play-action" : "/v1/game/play-action"}/${encodeURIComponent(gameId)}`,
};

const authHeaders = (): HeadersInit => {
    state.token = window.localStorage.getItem("accessToken") ?? state.token;
    return state.token ? { Authorization: state.token, "x-request-id": crypto.randomUUID() } : { "x-request-id": crypto.randomUUID() };
};

const sequenceStorageKey = (): string => `hoc.play.sequence.${state.gameId}.${state.playerId || "auth"}`;

const shortId = (value: string): string => (value ? value.slice(0, 8) : "-");

const creatureName = (id: number): string => CREATURE_NAMES[id] ?? `Creature ${id}`;

const phaseName = (phase: number): string => {
    if (phase === PlayPhase.PLACEMENT) return "Placement";
    if (phase === PlayPhase.PLAY) return "Play";
    if (phase === PlayPhase.FINISHED) return "Finished";
    if (phase === PlayPhase.ABANDONED) return "Abandoned";
    return "Unknown";
};

const pickPhaseName = (phase: number): string => {
    if (phase === PickPhase.INITIAL_PICK) return "Initial Pick";
    if (phase === PickPhase.PICK || phase === PickPhase.EXTENDED_PICK) return "Pick";
    if (phase === PickPhase.BAN || phase === PickPhase.EXTENDED_BAN) return "Ban";
    if (phase === PickPhase.AUGMENTS || phase === PickPhase.AUGMENTS_SCOUT) return "Augments";
    if (phase === PickPhase.ARTIFACT_1 || phase === PickPhase.ARTIFACT_2) return "Artifacts";
    return "Pick Phase";
};

const actionName = (actionType: PlayActionTypeValue): string => {
    for (const [name, value] of Object.entries(PlayActionType)) {
        if (value === actionType) return name;
    }
    return "UNKNOWN";
};

const eventName = (kind: number): string => {
    for (const [name, value] of Object.entries(PlayEventKind)) {
        if (value === kind) return name;
    }
    return "UNKNOWN";
};

const teamName = (team: number): string => {
    if (team === TEAM_LOWER) return "Red lower";
    if (team === TEAM_UPPER) return "Green upper";
    return "No team";
};

const log = (message: string): void => {
    state.logs.unshift(`${new Date().toLocaleTimeString()} ${message}`);
    state.logs = state.logs.slice(0, LOG_LIMIT);
    logNode.textContent = state.logs.join("\n");
};

const updateApiBase = (): void => {
    state.apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
    window.localStorage.setItem("hoc.play.apiBase", state.apiBase);
};

const updateUrl = (): void => {
    const nextUrl = new URL(window.location.href);
    if (state.gameId) nextUrl.searchParams.set("game", state.gameId);
    else nextUrl.searchParams.delete("game");
    if (state.playerId) nextUrl.searchParams.set("player", state.playerId);
    else nextUrl.searchParams.delete("player");
    if (state.apiBase && state.apiBase !== window.location.origin) nextUrl.searchParams.set("api", state.apiBase);
    else nextUrl.searchParams.delete("api");
    window.history.replaceState(null, "", nextUrl);
};

const setFlow = (flow: ClientState["flow"]): void => {
    state.flow = flow;
    render();
};

const stopStream = (label: string): void => {
    for (const stream of state.streams.filter((candidate) => candidate.label === label)) {
        stream.abort.abort();
    }
    state.streams = state.streams.filter((candidate) => candidate.label !== label);
};

const stopAllStreams = (): void => {
    for (const stream of state.streams) stream.abort.abort();
    state.streams = [];
};

const responseMessage = async (response: Response): Promise<string> => {
    const text = await response.text();
    return text || `Request failed with status ${response.status}`;
};

const authFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    updateApiBase();
    const headers = new Headers(init.headers);
    for (const [key, value] of Object.entries(authHeaders())) {
        headers.set(key, value);
    }
    const response = await fetch(apiUrl(path), { ...init, headers });
    const newToken = response.headers.get("x-new-token") || response.headers.get("authorization");
    if (newToken) {
        state.token = newToken;
        window.localStorage.setItem("accessToken", newToken);
    }
    return response;
};

const postAuth = async (path: string, body?: Uint8Array): Promise<Response> => {
    const response = await authFetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/octet-stream" } : undefined,
        body,
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    return response;
};

const deleteAuth = async (path: string): Promise<void> => {
    const response = await authFetch(path, { method: "DELETE" });
    if (!response.ok) throw new Error(await responseMessage(response));
};

const readBinaryAuth = async (path: string): Promise<Uint8Array> => {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(await responseMessage(response));
    return new Uint8Array(await response.arrayBuffer());
};

const openRawFrameStream = async (
    label: string,
    path: string,
    onFrame: (frame: string) => void,
    onClose?: () => void,
): Promise<void> => {
    stopStream(label);
    const abort = new AbortController();
    state.streams.push({ label, abort });
    const response = await authFetch(path, {
        headers: { Accept: "text/event-stream" },
        signal: abort.signal,
    });
    if (!response.ok || !response.body) throw new Error(await responseMessage(response));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    void (async () => {
        try {
            while (!abort.signal.aborted) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";
                for (const frame of frames) {
                    const cleanFrame = frame.trim();
                    if (cleanFrame) onFrame(cleanFrame);
                }
            }
        } catch (error) {
            if (!abort.signal.aborted) log(`${label} stream error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            state.streams = state.streams.filter((stream) => stream.abort !== abort);
            if (!abort.signal.aborted) onClose?.();
            render();
        }
    })();
};

const sseData = (frame: string): string => {
    return frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
};

const currentPlayer = () => state.snapshot?.players.find((player) => player.playerId === state.playerId);

const currentTeam = (): number => currentPlayer()?.team ?? state.team;

const selectedUnit = (): PlayUnitState | undefined =>
    state.snapshot?.units.find((unit) => unit.id === state.selectedUnitId);

const activeUnit = (): PlayUnitState | undefined =>
    state.snapshot?.units.find((unit) => unit.id === state.snapshot?.currentUnitId);

const updateSeats = (snapshot: PlaySnapshot): void => {
    state.lowerPlayerId = snapshot.players.find((player) => player.team === TEAM_LOWER)?.playerId ?? state.lowerPlayerId;
    state.upperPlayerId = snapshot.players.find((player) => player.team === TEAM_UPPER)?.playerId ?? state.upperPlayerId;
    const player = snapshot.players.find((candidate) => candidate.team === state.team);
    state.playerId = player?.playerId ?? state.playerId;
};

const applySnapshot = (snapshot: PlaySnapshot): void => {
    state.snapshot = snapshot;
    state.gameId = snapshot.gameId || state.gameId;
    state.lastSequence = Math.max(state.lastSequence, snapshot.latestSequence);
    updateSeats(snapshot);
    if (state.gameId) window.localStorage.setItem(sequenceStorageKey(), String(state.lastSequence));
    setFlow(snapshot.phase === PlayPhase.PLACEMENT ? "placement" : snapshot.phase === PlayPhase.PLAY ? "play" : "finished");
    updateUrl();
    render();
};

const applyPlayEvent = (event: { sequence: number; kind: number; message: string; snapshot?: PlaySnapshot }): void => {
    if (event.sequence && event.sequence <= state.lastSequence && event.kind !== PlayEventKind.SNAPSHOT) return;
    state.lastSequence = Math.max(state.lastSequence, event.sequence);
    if (event.snapshot) applySnapshot(event.snapshot);
    if (state.gameId) window.localStorage.setItem(sequenceStorageKey(), String(state.lastSequence));
    log(`#${event.sequence} ${eventName(event.kind)} ${event.message}`);
    render();
};

const loadCurrentGame = async (): Promise<void> => {
    const bytes = await readBinaryAuth(routes.gameCurrent);
    const game = GamePublic.deserializeBinary(bytes);
    state.gameId = game.id || state.gameId;
    state.team = game.team || state.team;
    if (game.id) {
        log(`Current game ${shortId(game.id)} as ${teamName(game.team)}`);
    }
    updateUrl();
};

const startMatchmaking = async (): Promise<void> => {
    if (!state.token) {
        setFlow("signed-out");
        log("Login or create an account before matchmaking");
        return;
    }

    stopAllStreams();
    state.snapshot = undefined;
    state.pickEvent = undefined;
    state.matchEvent = undefined;
    setFlow("queue");
    await openRawFrameStream("matchmaking", routes.mmEvents, (frame) => {
        const event = JSON.parse(frame) as MatchEvent;
        handleMatchEvent(event);
    });
    const response = await postAuth(routes.mmQueue);
    const enqueue = ResponseEnqueue.deserializeBinary(new Uint8Array(await response.arrayBuffer()));
    log(`Looking for opponent since ${new Date(enqueue.match_making_queue_added_time).toLocaleTimeString()}`);
};

const leaveQueue = async (): Promise<void> => {
    await deleteAuth(routes.mmQueue);
    stopStream("matchmaking");
    state.matchEvent = undefined;
    setFlow("idle");
    log("Left matchmaking queue");
};

const handleMatchEvent = (event: MatchEvent): void => {
    state.matchEvent = event;
    if (!event.ps) {
        setFlow("queue");
        return;
    }

    state.gameId = event.ps;
    if (event.r < 0) {
        setFlow("idle");
        log("Match confirmation expired");
        return;
    }
    if (event.c === 1) {
        stopStream("matchmaking");
        log(`Match ${shortId(event.ps)} confirmed`);
        void run(startPickOrPlay);
        return;
    }
    setFlow("confirm");
    log(`Opponent found: ${shortId(event.ps)}`);
};

const acceptMatch = async (): Promise<void> => {
    if (!state.gameId) return;
    await postAuth(routes.gameConfirm(state.gameId));
    await loadCurrentGame().catch(() => undefined);
    setFlow("confirm");
    log("Match accepted. Waiting for opponent.");
};

const startPickOrPlay = async (): Promise<void> => {
    await loadCurrentGame().catch(() => undefined);
    if (!state.gameId) {
        log("No current game yet");
        return;
    }
    const startedPlay = await tryStartPlay();
    if (startedPlay) return;
    await startPickStream();
};

const startPickStream = async (): Promise<void> => {
    if (!state.gameId) return;
    setFlow("pick");
    await openRawFrameStream(
        "pick",
        routes.pickEvents(state.gameId),
        (frame) => {
            const event = JSON.parse(frame) as PickEvent;
            state.pickEvent = event;
            setFlow("pick");
            log(`${pickPhaseName(event.pp)} update, ${event.t}s remaining`);
        },
        () => {
            log("Pick stream closed. Checking placement.");
            setTimeout(() => void run(startPickOrPlay), 1_000);
        },
    );
};

const submitPickPair = async (pairIndex: number): Promise<void> => {
    await postAuth(routes.pickPair, new PickPairRequest({ pair_index: pairIndex }).serializeBinary());
    log(`Initial pair ${pairIndex + 1} submitted`);
};

const submitPickCreature = async (creatureId: number): Promise<void> => {
    await postAuth(routes.pick, new PickBanRequest({ creature: creatureId }).serializeBinary());
    log(`Picked ${creatureName(creatureId)}`);
};

const submitBanCreature = async (creatureId: number): Promise<void> => {
    await postAuth(routes.ban, new PickBanRequest({ creature: creatureId }).serializeBinary());
    log(`Banned ${creatureName(creatureId)}`);
};

const tryStartPlay = async (): Promise<boolean> => {
    if (!state.gameId) return false;
    const response = await authFetch(routes.playSnapshot(state.gameId));
    if (!response.ok) return false;
    applySnapshot(decodePlaySnapshot(new Uint8Array(await response.arrayBuffer())));
    await startPlayStream();
    return true;
};

const startPlayStream = async (): Promise<void> => {
    if (!state.gameId) return;
    stopStream("play");
    const storedSequence = Number(window.localStorage.getItem(sequenceStorageKey()) ?? "0");
    const afterSequence = Number.isFinite(storedSequence) ? Math.max(storedSequence, state.lastSequence) : state.lastSequence;
    await openRawFrameStream("play", `${routes.playEvents(state.gameId)}?after=${afterSequence}`, (frame) => {
        const data = sseData(frame);
        if (!data) return;
        applyPlayEvent(decodeSsePlayEvent(data));
    });
};

const refreshSnapshot = async (): Promise<void> => {
    if (state.flow === "pick") {
        await startPickOrPlay();
        return;
    }
    if (!state.gameId) {
        await loadCurrentGame();
        return;
    }
    const started = await tryStartPlay();
    if (!started) await startPickOrPlay();
};

const submitAction = async (
    type: PlayActionTypeValue,
    fields: {
        unitId?: string;
        unitName?: string;
        team?: number;
        cells?: { x: number; y: number }[];
        reason?: string;
    } = {},
): Promise<void> => {
    if (!state.gameId) {
        log("No connected match");
        return;
    }

    const response = await authFetch(routes.playAction(state.gameId), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: encodePlayAction({
            actionId: crypto.randomUUID(),
            gameId: state.gameId,
            playerId: state.playerId,
            expectedSequence: state.lastSequence,
            type,
            ...fields,
        }),
    });
    if (!response.ok) throw new Error(await responseMessage(response));

    const actionResponse = decodePlayActionResponse(new Uint8Array(await response.arrayBuffer()));
    if (actionResponse.event) applyPlayEvent(actionResponse.event);
    if (actionResponse.accepted) {
        log(`${actionName(type)} accepted`);
    } else {
        log(`${actionName(type)} rejected: ${actionResponse.rejectionReason || actionResponse.message}`);
        await refreshSnapshot();
    }
};

const cellsForUnitAt = (unit: PlayUnitState, x: number, y: number): { x: number; y: number }[] => {
    if (unit.size !== UNIT_SIZE_LARGE) return [{ x, y }];
    return [
        { x, y },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 },
    ];
};

const handleCellClick = (x: number, y: number): void => {
    const snapshot = state.snapshot;
    const unit = selectedUnit();
    const team = currentTeam();

    if (!snapshot || snapshot.phase !== PlayPhase.PLACEMENT) {
        log("Board placement is only available during placement");
        return;
    }
    if (!unit) {
        log("Select one of your unplaced units first");
        return;
    }
    if (unit.team !== team) {
        log("Selected unit belongs to the other seat");
        return;
    }
    if (unit.placed) {
        log("Selected unit is already placed");
        return;
    }

    void submitAction(PlayActionType.PLACE_UNIT, {
        unitId: unit.id,
        unitName: unit.name,
        team: unit.team,
        cells: cellsForUnitAt(unit, x, y),
    });
};

const seatUrl = (playerId: string): string => {
    const url = new URL(window.location.href);
    url.searchParams.set("game", state.gameId);
    url.searchParams.set("player", playerId);
    if (state.apiBase && state.apiBase !== window.location.origin) url.searchParams.set("api", state.apiBase);
    return url.toString();
};

const copyText = async (value: string): Promise<void> => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    log("Seat link copied");
};

const renderSession = (): void => {
    const snapshot = state.snapshot;
    const player = currentPlayer();
    const active = activeUnit();
    const remainingSeconds =
        snapshot?.phase === PlayPhase.PLACEMENT && snapshot.placementDeadlineMs
            ? Math.max(0, Math.ceil((snapshot.placementDeadlineMs - Date.now()) / 1000))
            : 0;

    statusNode.textContent = state.token ? state.flow : "Signed out";
    phaseNode.textContent = snapshot ? phaseName(snapshot.phase) : state.pickEvent ? pickPhaseName(state.pickEvent.pp) : "No match";
    deadlineNode.textContent = snapshot?.phase === PlayPhase.PLACEMENT ? `${remainingSeconds}s` : state.pickEvent ? `${state.pickEvent.t}s` : "-";
    seatNode.textContent = player
        ? `${teamName(player.team)} ${shortId(player.playerId)}`
        : state.team
          ? teamName(state.team)
          : shortId(state.playerId);
    currentTurnNode.textContent = active
        ? `${teamName(active.team)} ${active.name} ${shortId(active.id)}`
        : snapshot?.phase === PlayPhase.PLAY
          ? "Resolving"
          : "-";
};

const renderFlow = (): void => {
    const chunks: string[] = [];
    if (!state.token) {
        chunks.push("Login or create an account, then return here to find an opponent.");
    } else if (state.flow === "queue") {
        chunks.push(`Looking for opponent. Queue size: ${state.matchEvent?.po ?? "-"} .`);
    } else if (state.flow === "confirm") {
        chunks.push(`Opponent found for game ${shortId(state.gameId)}. ${state.matchEvent?.r ?? "-"}s to accept.`);
    } else if (state.flow === "pick") {
        chunks.push(`Pick phase active. ${state.pickEvent ? pickPhaseName(state.pickEvent.pp) : "Waiting for first pick update"}.`);
    } else if (state.flow === "placement") {
        chunks.push("Placement phase active. Place your units, then ready.");
    } else if (state.flow === "play") {
        chunks.push("Fight is live.");
    } else {
        chunks.push("Ready to find a ranked opponent.");
    }
    flowNode.textContent = chunks.join(" ");
};

const renderLinks = (): void => {
    const lowerUrl = state.lowerPlayerId ? seatUrl(state.lowerPlayerId) : "";
    const upperUrl = state.upperPlayerId ? seatUrl(state.upperPlayerId) : "";
    openLowerLink.href = lowerUrl || "#";
    openUpperLink.href = upperUrl || "#";
    copyLowerButton.disabled = !lowerUrl;
    copyUpperButton.disabled = !upperUrl;
    openLowerLink.toggleAttribute("aria-disabled", !lowerUrl);
    openUpperLink.toggleAttribute("aria-disabled", !upperUrl);
};

const renderUnits = (): void => {
    unitListNode.replaceChildren();
    const snapshot = state.snapshot;
    const team = currentTeam();
    if (!snapshot || !team) {
        unitListNode.textContent = "Units appear after pick completes.";
        return;
    }

    const units = snapshot.units
        .filter((unit) => unit.team === team)
        .sort((left, right) => Number(left.placed) - Number(right.placed) || left.name.localeCompare(right.name));

    for (const unit of units) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "play-unit-card";
        button.dataset.selected = String(unit.id === state.selectedUnitId);
        button.dataset.placed = String(unit.placed);
        button.disabled = snapshot.phase !== PlayPhase.PLACEMENT || unit.placed;
        button.addEventListener("click", () => {
            state.selectedUnitId = unit.id;
            render();
        });

        const title = document.createElement("strong");
        title.textContent = unit.name;
        const meta = document.createElement("span");
        meta.textContent = `${unit.placed ? "Placed" : "Bench"} | HP ${unit.hp}/${unit.maxHp} | Stack ${unit.amountAlive}`;
        button.append(title, meta);
        unitListNode.append(button);
    }
};

const renderPickPanel = (): void => {
    pickPanelNode.replaceChildren();
    const event = state.pickEvent;
    if (!event || state.flow !== "pick") {
        pickPanelNode.hidden = true;
        return;
    }
    pickPanelNode.hidden = false;

    const title = document.createElement("strong");
    title.textContent = pickPhaseName(event.pp);
    const meta = document.createElement("span");
    const canAct = event.a.includes(state.team);
    meta.textContent = `${canAct ? "Your action" : "Waiting"} | picked ${event.p.length} | opponent ${event.op.length} | banned ${event.b.length}`;
    pickPanelNode.append(title, meta);

    if (!canAct) return;

    if (event.pp === PickPhase.INITIAL_PICK) {
        for (const [index, pair] of event.ip.entries()) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "play-pick-choice";
            button.textContent = `Pick ${pair.map(creatureName).join(" + ")}`;
            button.addEventListener("click", () => void run(() => submitPickPair(index)));
            pickPanelNode.append(button);
        }
        return;
    }

    const isPick = event.pp === PickPhase.PICK || event.pp === PickPhase.EXTENDED_PICK;
    const isBan = event.pp === PickPhase.BAN || event.pp === PickPhase.EXTENDED_BAN;
    if (!isPick && !isBan) {
        const waiting = document.createElement("span");
        waiting.textContent = "This phase auto-resolves on the server.";
        pickPanelNode.append(waiting);
        return;
    }

    const unavailable = new Set([...event.p, ...event.op, ...event.b]);
    for (const creatureId of CreatureByLevel.flat().filter((id) => id > 0 && !unavailable.has(id))) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "play-pick-choice";
        button.textContent = `${isPick ? "Pick" : "Ban"} ${creatureName(creatureId)}`;
        button.addEventListener("click", () => void run(() => isPick ? submitPickCreature(creatureId) : submitBanCreature(creatureId)));
        pickPanelNode.append(button);
    }
};

const unitInitials = (name: string): string =>
    name
        .split(/[\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "?";

const renderBoard = (): void => {
    boardNode.replaceChildren();
    const occupants = new Map<string, PlayUnitState>();
    const baseCells = new Set<string>();

    for (const unit of state.snapshot?.units ?? []) {
        for (const cell of unit.cells) occupants.set(`${cell.x}:${cell.y}`, unit);
        if (unit.placed) baseCells.add(`${unit.baseCell.x}:${unit.baseCell.y}`);
    }

    for (let y = GRID_SIZE - 1; y >= 0; y--) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const key = `${x}:${y}`;
            const occupant = occupants.get(key);
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "play-cell";
            if (y <= 4) cell.classList.add("play-cell-lower-zone");
            if (y >= 11) cell.classList.add("play-cell-upper-zone");
            if (occupant) {
                cell.classList.add(occupant.team === TEAM_LOWER ? "play-cell-lower" : "play-cell-upper");
                cell.title = `${occupant.name} ${occupant.amountAlive} at ${x}, ${y}`;
                if (baseCells.has(key)) {
                    const name = document.createElement("strong");
                    name.textContent = unitInitials(occupant.name);
                    const amount = document.createElement("span");
                    amount.textContent = String(occupant.amountAlive);
                    cell.append(name, amount);
                }
            } else {
                cell.title = `${x}, ${y}`;
            }
            cell.addEventListener("click", () => handleCellClick(x, y));
            boardNode.append(cell);
        }
    }
};

const renderActions = (): void => {
    const snapshot = state.snapshot;
    const team = currentTeam();
    const active = activeUnit();
    const isReady = !!state.playerId && !!snapshot?.readyPlayerIds.includes(state.playerId);
    const signedIn = !!state.token;

    authLink.hidden = signedIn;
    createButton.disabled = !signedIn || state.flow === "queue" || state.flow === "confirm" || state.flow === "pick" || state.flow === "placement" || state.flow === "play";
    acceptButton.hidden = state.flow !== "confirm";
    acceptButton.disabled = !state.gameId;
    cancelQueueButton.hidden = state.flow !== "queue";
    connectButton.disabled = !signedIn;
    refreshButton.disabled = !signedIn;
    readyButton.disabled = !snapshot || snapshot.phase !== PlayPhase.PLACEMENT || isReady;
    endTurnButton.disabled = !snapshot || snapshot.phase !== PlayPhase.PLAY || !active || active.team !== team;
};

const render = (): void => {
    renderSession();
    renderFlow();
    renderLinks();
    renderUnits();
    renderPickPanel();
    renderBoard();
    renderActions();
};

const run = async (operation: () => Promise<void> | void): Promise<void> => {
    try {
        await operation();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Error: ${message}`);
    } finally {
        render();
    }
};

createButton.addEventListener("click", () => void run(startMatchmaking));
acceptButton.addEventListener("click", () => void run(acceptMatch));
cancelQueueButton.addEventListener("click", () => void run(leaveQueue));
connectButton.addEventListener("click", () => void run(startPickOrPlay));
refreshButton.addEventListener("click", () => void run(refreshSnapshot));
readyButton.addEventListener("click", () => void run(() => submitAction(PlayActionType.READY_PLACEMENT)));
endTurnButton.addEventListener("click", () =>
    void run(() => {
        const unit = activeUnit();
        if (!unit) {
            log("No active unit");
            return;
        }
        return submitAction(PlayActionType.END_TURN, { unitId: unit.id, team: unit.team, reason: "manual" });
    }),
);
copyLowerButton.addEventListener("click", () => void run(() => copyText(seatUrl(state.lowerPlayerId))));
copyUpperButton.addEventListener("click", () => void run(() => copyText(seatUrl(state.upperPlayerId))));
apiBaseInput.addEventListener("change", () => {
    updateApiBase();
    updateUrl();
});

setInterval(renderSession, 1000);
render();

if (!state.token) {
    setFlow("signed-out");
} else if (state.gameId) {
    state.lastSequence = Number(window.localStorage.getItem(sequenceStorageKey()) ?? "0");
    void run(startPickOrPlay);
} else {
    void run(loadCurrentGame);
}
