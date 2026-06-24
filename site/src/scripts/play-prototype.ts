import {
    decodeDevCreatePlayGameResponse,
    decodePlayActionResponse,
    decodePlaySnapshot,
    decodeSsePlayEvent,
    encodeDevCreatePlayGameRequest,
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

interface ClientState {
    apiBase: string;
    gameId: string;
    playerId: string;
    lowerPlayerId: string;
    upperPlayerId: string;
    selectedUnitId: string;
    lastSequence: number;
    snapshot?: PlaySnapshot;
    eventSource?: EventSource;
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
const createButton = byId<HTMLButtonElement>("play-create");
const connectButton = byId<HTMLButtonElement>("play-connect");
const refreshButton = byId<HTMLButtonElement>("play-refresh");
const readyButton = byId<HTMLButtonElement>("play-ready");
const endTurnButton = byId<HTMLButtonElement>("play-end-turn");
const copyLowerButton = byId<HTMLButtonElement>("play-copy-lower");
const copyUpperButton = byId<HTMLButtonElement>("play-copy-upper");
const openLowerLink = byId<HTMLAnchorElement>("play-open-lower");
const openUpperLink = byId<HTMLAnchorElement>("play-open-upper");
const statusNode = byId<HTMLDivElement>("play-status");
const phaseNode = byId<HTMLDivElement>("play-phase");
const deadlineNode = byId<HTMLDivElement>("play-deadline");
const seatNode = byId<HTMLDivElement>("play-seat");
const currentTurnNode = byId<HTMLDivElement>("play-current-turn");
const unitListNode = byId<HTMLDivElement>("play-unit-list");
const boardNode = byId<HTMLDivElement>("play-board");
const logNode = byId<HTMLPreElement>("play-log");

const params = new URLSearchParams(window.location.search);
const defaultApiBase =
    params.get("api") ??
    window.localStorage.getItem("hoc.play.apiBase") ??
    (window.location.hostname === "localhost" && window.location.port !== "43877"
        ? "http://localhost:43877"
        : window.location.origin);

const state: ClientState = {
    apiBase: defaultApiBase,
    gameId: params.get("game") ?? "",
    playerId: params.get("player") ?? "",
    lowerPlayerId: "",
    upperPlayerId: "",
    selectedUnitId: "",
    lastSequence: 0,
    logs: [],
};

apiBaseInput.value = state.apiBase;

const apiUrl = (path: string): string => `${state.apiBase.replace(/\/$/, "")}${path}`;

const sequenceStorageKey = (): string => `hoc.play.sequence.${state.gameId}.${state.playerId}`;

const shortId = (value: string): string => (value ? value.slice(0, 8) : "-");

const phaseName = (phase: number): string => {
    if (phase === PlayPhase.PLACEMENT) {
        return "Placement";
    }
    if (phase === PlayPhase.PLAY) {
        return "Play";
    }
    if (phase === PlayPhase.FINISHED) {
        return "Finished";
    }
    if (phase === PlayPhase.ABANDONED) {
        return "Abandoned";
    }
    return "Unknown";
};

const actionName = (actionType: PlayActionTypeValue): string => {
    for (const [name, value] of Object.entries(PlayActionType)) {
        if (value === actionType) {
            return name;
        }
    }
    return "UNKNOWN";
};

const eventName = (kind: number): string => {
    for (const [name, value] of Object.entries(PlayEventKind)) {
        if (value === kind) {
            return name;
        }
    }
    return "UNKNOWN";
};

const teamName = (team: number): string => {
    if (team === TEAM_LOWER) {
        return "Red lower";
    }
    if (team === TEAM_UPPER) {
        return "Green upper";
    }
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
    if (state.gameId) {
        nextUrl.searchParams.set("game", state.gameId);
    }
    if (state.playerId) {
        nextUrl.searchParams.set("player", state.playerId);
    }
    if (state.apiBase && state.apiBase !== window.location.origin) {
        nextUrl.searchParams.set("api", state.apiBase);
    } else {
        nextUrl.searchParams.delete("api");
    }
    window.history.replaceState(null, "", nextUrl);
};

const seatUrl = (playerId: string): string => {
    const url = new URL(window.location.href);
    url.searchParams.set("game", state.gameId);
    url.searchParams.set("player", playerId);
    if (state.apiBase && state.apiBase !== window.location.origin) {
        url.searchParams.set("api", state.apiBase);
    }
    return url.toString();
};

const currentPlayer = () => state.snapshot?.players.find((player) => player.playerId === state.playerId);

const currentTeam = (): number => currentPlayer()?.team ?? 0;

const selectedUnit = (): PlayUnitState | undefined =>
    state.snapshot?.units.find((unit) => unit.id === state.selectedUnitId);

const activeUnit = (): PlayUnitState | undefined =>
    state.snapshot?.units.find((unit) => unit.id === state.snapshot?.currentUnitId);

const updateSeats = (snapshot: PlaySnapshot): void => {
    state.lowerPlayerId = snapshot.players.find((player) => player.team === TEAM_LOWER)?.playerId ?? state.lowerPlayerId;
    state.upperPlayerId = snapshot.players.find((player) => player.team === TEAM_UPPER)?.playerId ?? state.upperPlayerId;
};

const applySnapshot = (snapshot: PlaySnapshot): void => {
    state.snapshot = snapshot;
    state.gameId = snapshot.gameId || state.gameId;
    state.lastSequence = Math.max(state.lastSequence, snapshot.latestSequence);
    updateSeats(snapshot);
    if (state.gameId && state.playerId) {
        window.localStorage.setItem(sequenceStorageKey(), String(state.lastSequence));
    }
    render();
};

const applyEvent = (event: { sequence: number; kind: number; message: string; snapshot?: PlaySnapshot }): void => {
    if (event.sequence && event.sequence <= state.lastSequence && event.kind !== PlayEventKind.SNAPSHOT) {
        return;
    }
    state.lastSequence = Math.max(state.lastSequence, event.sequence);
    if (event.snapshot) {
        applySnapshot(event.snapshot);
    }
    if (state.gameId && state.playerId) {
        window.localStorage.setItem(sequenceStorageKey(), String(state.lastSequence));
    }
    log(`#${event.sequence} ${eventName(event.kind)} ${event.message}`);
    render();
};

const copyText = async (value: string): Promise<void> => {
    if (!value) {
        return;
    }
    await navigator.clipboard?.writeText(value);
    log("Seat link copied");
};

const createMatch = async (): Promise<void> => {
    updateApiBase();
    state.eventSource?.close();
    state.eventSource = undefined;

    const lowerPlayerId = crypto.randomUUID();
    const upperPlayerId = crypto.randomUUID();
    const response = await fetch(apiUrl("/v1/game/play-dev-create"), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: encodeDevCreatePlayGameRequest({
            lowerPlayerId,
            upperPlayerId,
            unitAmount: 10,
            placementSeconds: 45,
        }),
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const created = decodeDevCreatePlayGameResponse(new Uint8Array(await response.arrayBuffer()));
    state.gameId = created.gameId;
    state.playerId = lowerPlayerId;
    state.selectedUnitId = "";
    state.lastSequence = 0;
    if (created.snapshot) {
        applySnapshot(created.snapshot);
    }
    updateUrl();
    log(`Created match ${shortId(state.gameId)}`);
    connect();
};

const connect = (): void => {
    updateApiBase();
    if (!state.gameId || !state.playerId) {
        log("Create a match or open a seat link first");
        return;
    }

    state.eventSource?.close();
    const storedSequence = Number(window.localStorage.getItem(sequenceStorageKey()) ?? "0");
    const afterSequence = Number.isFinite(storedSequence) ? Math.max(storedSequence, state.lastSequence) : state.lastSequence;
    const url = new URL(apiUrl(`/v1/game/play-events/${encodeURIComponent(state.gameId)}`));
    url.searchParams.set("playerId", state.playerId);
    url.searchParams.set("after", String(afterSequence));

    const eventSource = new EventSource(url);
    state.eventSource = eventSource;
    eventSource.addEventListener("open", () => {
        statusNode.textContent = "Connected";
        log(`Connected as ${shortId(state.playerId)}`);
    });
    eventSource.addEventListener("play-pb", (event) => {
        const message = event as MessageEvent<string>;
        applyEvent(decodeSsePlayEvent(message.data));
    });
    eventSource.addEventListener("error", () => {
        statusNode.textContent = "Reconnecting";
    });
    updateUrl();
    render();
};

const refreshSnapshot = async (): Promise<void> => {
    updateApiBase();
    if (!state.gameId || !state.playerId) {
        return;
    }

    const url = new URL(apiUrl(`/v1/game/play-snapshot/${encodeURIComponent(state.gameId)}`));
    url.searchParams.set("playerId", state.playerId);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(await response.text());
    }
    applySnapshot(decodePlaySnapshot(new Uint8Array(await response.arrayBuffer())));
    log("Snapshot refreshed");
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
    updateApiBase();
    if (!state.gameId || !state.playerId) {
        log("No connected match");
        return;
    }

    const response = await fetch(apiUrl(`/v1/game/play-action/${encodeURIComponent(state.gameId)}?playerId=${state.playerId}`), {
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

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const actionResponse = decodePlayActionResponse(new Uint8Array(await response.arrayBuffer()));
    if (actionResponse.event) {
        applyEvent(actionResponse.event);
    }
    if (actionResponse.accepted) {
        log(`${actionName(type)} accepted`);
    } else {
        log(`${actionName(type)} rejected: ${actionResponse.rejectionReason || actionResponse.message}`);
        await refreshSnapshot();
    }
};

const cellsForUnitAt = (unit: PlayUnitState, x: number, y: number): { x: number; y: number }[] => {
    if (unit.size !== UNIT_SIZE_LARGE) {
        return [{ x, y }];
    }
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

const renderSession = (): void => {
    const snapshot = state.snapshot;
    const player = currentPlayer();
    const active = activeUnit();
    const remainingSeconds =
        snapshot?.phase === PlayPhase.PLACEMENT && snapshot.placementDeadlineMs
            ? Math.max(0, Math.ceil((snapshot.placementDeadlineMs - Date.now()) / 1000))
            : 0;

    statusNode.textContent = state.eventSource ? statusNode.textContent || "Connecting" : "Not connected";
    phaseNode.textContent = snapshot ? phaseName(snapshot.phase) : "No match";
    deadlineNode.textContent = snapshot?.phase === PlayPhase.PLACEMENT ? `${remainingSeconds}s` : "-";
    seatNode.textContent = player ? `${teamName(player.team)} ${shortId(player.playerId)}` : shortId(state.playerId);
    currentTurnNode.textContent = active
        ? `${teamName(active.team)} ${active.name} ${shortId(active.id)}`
        : snapshot?.phase === PlayPhase.PLAY
          ? "Resolving"
          : "-";
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
        unitListNode.textContent = "No seat snapshot yet.";
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
        for (const cell of unit.cells) {
            occupants.set(`${cell.x}:${cell.y}`, unit);
        }
        if (unit.placed) {
            baseCells.add(`${unit.baseCell.x}:${unit.baseCell.y}`);
        }
    }

    for (let y = GRID_SIZE - 1; y >= 0; y--) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const key = `${x}:${y}`;
            const occupant = occupants.get(key);
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "play-cell";
            cell.dataset.x = String(x);
            cell.dataset.y = String(y);
            if (y <= 4) {
                cell.classList.add("play-cell-lower-zone");
            }
            if (y >= 11) {
                cell.classList.add("play-cell-upper-zone");
            }
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
    readyButton.disabled = !snapshot || snapshot.phase !== PlayPhase.PLACEMENT || isReady;
    endTurnButton.disabled = !snapshot || snapshot.phase !== PlayPhase.PLAY || !active || active.team !== team;
    refreshButton.disabled = !state.gameId || !state.playerId;
    connectButton.disabled = !state.gameId || !state.playerId;
};

const render = (): void => {
    renderSession();
    renderLinks();
    renderUnits();
    renderBoard();
    renderActions();
};

const run = async (operation: () => Promise<void> | void): Promise<void> => {
    try {
        await operation();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Error: ${message}`);
    }
};

createButton.addEventListener("click", () => void run(createMatch));
connectButton.addEventListener("click", () => void run(() => connect()));
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

if (state.gameId && state.playerId) {
    state.lastSequence = Number(window.localStorage.getItem(sequenceStorageKey()) ?? "0");
    connect();
}
