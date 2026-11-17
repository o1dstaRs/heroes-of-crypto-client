import {
    Artifact,
    GridConstants,
    GridSettings,
    GridVals,
    PlacementPositionType,
    RectanglePlacement,
    SynergyKeysToPower,
    ToFactionName,
    creatureInfo,
    synergyVariantsForSeed,
} from "@heroesofcrypto/common";
import {
    cells,
    propose,
    valid,
    type Body,
    type Point,
    type PublicInput,
} from "@heroesofcrypto/common/src/ai/placement/layout";
import { synergyEffectAtLevel, synergyNextLevel } from "../LeftSideBar/synergyLadder";
import type { PremiumDraftState } from "./premiumDraftAssessment";

export const DRAFT_PLANNER_FACTIONS = ["Life", "Nature", "Chaos", "Might"] as const;
export type DraftFormationStyle = "screen" | "spread";
export type DraftProjectedStack = Body & { position: Point; role: string };
export interface DraftPlanStep {
    title: string;
    text: string;
    unitIds: number[];
}
export interface DraftPlanArrow {
    from: Point;
    to: Point;
    kind: "advance" | "support";
    creature: number;
}
const distinctUnits = (ids: readonly number[]) =>
    [...new Set(ids)].flatMap((id) => {
        const info = Number.isSafeInteger(id) && id > 0 ? creatureInfo(id) : undefined;
        return info ? [info] : [];
    });
const synergyLabels: Record<string, readonly string[]> = {
    Life: ["Supply", "Morale & luck"],
    Nature: ["Extra stacks", "Flying armor"],
    Chaos: ["Movement", "Break on attack"],
    Might: ["Aura range", "Ability power"],
};

/** Detached public-information projection. Never reads a fight, predicts enemy positions as fact,
 * applies a loadout, or supplies actions/placements to the match or the shipped AI. */
export function projectPremiumDraft(draft: PremiumDraftState, style: DraftFormationStyle = "screen") {
    const own = distinctUnits(draft.picked),
        enemy = distinctUnits(draft.opponentPicked);
    const variants = draft.gameId ? synergyVariantsForSeed(draft.gameId) : undefined;
    const synergies = DRAFT_PLANNER_FACTIONS.map((faction) => {
        const count = own.filter((unit) => ToFactionName[unit.faction] === faction).length;
        const enemyCount = enemy.filter((unit) => ToFactionName[unit.faction] === faction).length;
        const variant = variants?.[faction];
        const level = Math.min(3, Math.floor(count / 2));
        const enemyLevel = Math.min(3, Math.floor(enemyCount / 2));
        return {
            faction,
            variant,
            count,
            level,
            enemyCount,
            enemyLevel,
            label: variant ? synergyLabels[faction][variant - 1] : "Variant not known",
            effect: variant && level ? synergyEffectAtLevel(faction, variant, level) : "Not active yet",
            enemyEffect:
                variant && enemyLevel
                    ? synergyEffectAtLevel(faction, variant, enemyLevel)
                    : "Not active among revealed picks",
            next: synergyNextLevel(count),
        };
    });
    const revealedMap = draft.scouting?.map ?? draft.revealedMap;
    const map = [GridVals.NORMAL, GridVals.LAVA_CENTER, GridVals.BLOCK_CENTER].includes(revealedMap ?? 0)
        ? revealedMap
        : undefined;
    const formation = (units: typeof own, opposing: typeof enemy, left: boolean): DraftProjectedStack[] => {
        if (!units.length) return [];
        const { GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA } = GridConstants;
        const zone = new RectanglePlacement(
            new GridSettings(GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA),
            left ? PlacementPositionType.LEFT_BOTTOM : PlacementPositionType.RIGHT_TOP,
            3,
            true,
        );
        const bodies: Body[] = units.map((unit) => ({
            id: String(unit.id),
            creature: unit.id,
            name: unit.name,
            amount: Math.ceil(1000 / unit.exp),
            width: unit.footprintWidth,
            height: unit.footprintHeight,
            ranged: unit.ranged,
            caster: unit.caster,
            healer: unit.name === "Healer",
            aura: unit.auraCount > 0,
            fly: unit.canFly,
            driven: unit.abilities.includes("AI Driven"),
            hp: unit.hp,
            damage: unit.maxDamage,
            range: unit.distance,
            steps: unit.movementSteps ?? 0,
            initiative: unit.initiative,
            level: unit.level,
        }));
        const input: PublicInput = {
            bodies,
            enemyIds: opposing.map((unit) => unit.id),
            enemyKits: opposing.map((unit) => unit.abilities),
            map: map ?? GridVals.NORMAL,
            artifacts: left ? [draft.artifactTier1, draft.artifactTier2] : [],
            doctrine: draft.doctrine ?? 0,
            augments: [],
            left,
            legal: [...zone.possibleCellHashes()],
        };
        const positions: Point[] = new Array(bodies.length),
            occupied = new Set<number>();
        const ordered = bodies
            .map((body, index) => ({ body, index }))
            .sort((a, b) => b.body.width * b.body.height - a.body.width * a.body.height || a.index - b.index);
        for (const { body, index } of ordered) {
            const back = body.ranged || (body.caster && !units[index].melee);
            const targetX = back ? body.width : 3;
            const targetY = 3 + (index % 3) * 4;
            const anchors = zone
                .possibleCellPositions(true, body.width, body.height)
                .filter((p) => cells(body, p).every((c) => !occupied.has((c.x << 4) | c.y)))
                .sort((a, b) => {
                    const score = (p: Point) =>
                        Math.abs(p.x - (left ? targetX : 15 - targetX + body.width - 1)) * 10 + Math.abs(p.y - targetY);
                    return score(a) - score(b) || a.y - b.y || a.x - b.x;
                });
            if (!anchors[0]) return []; // a malformed/off-roster draft must not break picking
            positions[index] = anchors[0];
            cells(body, anchors[0]).forEach((p) => occupied.add((p.x << 4) | p.y));
        }
        if (!valid(input, positions)) return [];
        // Same public-kit/spread proposal family as the website; this remains an illustrative preview.
        const planned = propose(input, positions, style === "spread" ? 2 : 6);
        const life = synergies.find((item) => item.faction === "Life")!;
        const supplyLevel = left ? life.level : life.enemyLevel;
        const supply = life.variant === 1 && supplyLevel ? (SynergyKeysToPower[`Life:1:${supplyLevel}`]?.[0] ?? 0) : 0;
        return bodies.map((body, index) => ({
            ...body,
            amount: Math.floor(body.amount * (1 + supply / 100)),
            position: planned[index],
            role: body.ranged
                ? "Ranged pressure"
                : body.caster && !units[index].melee
                  ? "Support"
                  : body.fly
                    ? "Flank"
                    : "Front line",
        }));
    };
    const ownStacks = formation(own, enemy, true),
        enemyStacks = formation(enemy, own, false);
    const carriers = ownStacks.filter((unit) => unit.role === "Ranged pressure");
    const supports = ownStacks.filter((unit) => unit.role === "Support");
    const guards = ownStacks.filter((unit) => unit.role === "Front line" || unit.role === "Flank");
    const threats = enemy.filter((unit) => unit.ranged || unit.rangedSpellDamage);
    const steps: DraftPlanStep[] = [];
    if (carriers.length)
        steps.push({
            title: "Protect your damage",
            text: `${carriers.map((u) => u.name).join(", ")} behind the front line; preserve room to shoot.`,
            unitIds: carriers.map((u) => u.creature),
        });
    if (guards.length)
        steps.push({
            title: carriers.length ? "Screen and advance" : "Close the distance",
            text: `${guards.map((u) => u.name).join(", ")} ${carriers.length ? "cover the approach to your back line, then contest the center" : "need contact; approach with cover and avoid bunching up"}.`,
            unitIds: guards.map((u) => u.creature),
        });
    if (supports.length)
        steps.push({
            title: "Keep support safe",
            text: `${supports.map((u) => u.name).join(", ")} start behind the screen. Keep useful spell targets in reach.`,
            unitIds: supports.map((u) => u.creature),
        });
    if (threats.length)
        steps.push({
            title: "Revealed threats",
            text: `${threats.map((u) => u.name).join(", ")} provide enemy ranged pressure. Use cover or a safe approach.`,
            unitIds: threats.map((u) => u.id),
        });
    const center = (unit: DraftProjectedStack): Point => ({
        x: unit.position.x - (unit.width - 1) / 2 + 0.5,
        y: unit.position.y - (unit.height - 1) / 2 + 0.5,
    });
    const arrows: DraftPlanArrow[] = guards.map((unit) => {
        const from = center(unit);
        // Strategic staging direction, not an asserted legal move or shot through hidden obstacles.
        const y = map && map !== GridVals.NORMAL && from.y >= 6 && from.y <= 10 ? (from.y < 8 ? 4.5 : 11.5) : from.y;
        return { from, to: { x: 6, y }, kind: "advance", creature: unit.creature };
    });
    for (const unit of supports) {
        const target = carriers[0] ?? guards[0];
        if (target) arrows.push({ from: center(unit), to: center(target), kind: "support", creature: unit.creature });
    }
    const artifacts = [
        draft.artifactTier1 ? Artifact.getTier1ArtifactProperties(draft.artifactTier1) : undefined,
        draft.artifactTier2 ? Artifact.getTier2ArtifactProperties(draft.artifactTier2) : undefined,
    ].flatMap((artifact, index) => (artifact ? [{ ...artifact, tier: index + 1 }] : []));
    return {
        own: ownStacks,
        enemy: enemyStacks,
        map,
        synergies,
        steps,
        arrows,
        artifacts,
        hiddenEnemy: Math.max(0, 6 - enemy.length),
    };
}

export interface DraftPanelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Also clamps restored geometry after window resize/zoom; the drag handle always remains reachable. */
export function clampDraftPanel(rect: DraftPanelRect, viewport: { width: number; height: number }): DraftPanelRect {
    const width = Math.min(Math.max(300, rect.width), Math.max(1, viewport.width - 24));
    const height = Math.min(Math.max(140, rect.height), Math.max(1, viewport.height - 24));
    return {
        width,
        height,
        x: Math.max(12, Math.min(rect.x, viewport.width - width - 12)),
        y: Math.max(12, Math.min(rect.y, viewport.height - height - 12)),
    };
}
