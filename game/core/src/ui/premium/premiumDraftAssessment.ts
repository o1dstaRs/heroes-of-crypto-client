import {
    Artifact,
    CreaturePoolByLevel,
    GridVals,
    creatureInfo,
    draftCreatureContinuation,
    draftFactionCompletion,
    draftFactionContinuations,
    synergyVariantsForSeed,
    ToFactionName,
    type IDraftScoutingContext,
} from "@heroesofcrypto/common";

import { synergyNextLevel } from "../LeftSideBar/synergyLadder";

export interface PremiumDraftState {
    gameId?: string;
    picked: readonly number[];
    /** Only the roster revealed to this player by the pick stream; zeroes are hidden slots. */
    opponentPicked: readonly number[];
    artifactTier1: number;
    artifactTier2: number;
    isYourTurn: boolean | null;
    scouting?: IDraftScoutingContext;
}

export interface PremiumDraftAssessment {
    headline: string;
    focus: string;
    roster: string;
    scouting?: string;
    remaining?: string;
    routes: PremiumDraftRoute[];
    routeWarning?: string;
    notes: { label: string; text: string }[];
}

export interface PremiumDraftRoute {
    faction: string;
    label: string;
    count: number;
    target: number;
    reachable: boolean;
    uncertain: boolean;
    targets: { id: number; name: string; level: number }[];
}

const synergyNames: Record<string, readonly string[]> = {
    Life: ["Supply", "Morale & luck"],
    Chaos: ["Movement", "Break on attack"],
    Might: ["Aura range", "Abilities power"],
    Nature: ["Board units", "Flying armor"],
};

const rosterInfo = (ids: readonly number[]) => [...new Set(ids)].flatMap((id) => creatureInfo(id) ?? []);
const totalPicks = CreaturePoolByLevel.reduce((total, count) => total + count, 0);

/** Describe confirmed picks using game rules, without treating a partial roster as a win prediction. */
export const premiumDraftAssessment = (draft: PremiumDraftState): PremiumDraftAssessment => {
    const own = rosterInfo(draft.picked);
    const enemy = rosterInfo(draft.opponentPicked);
    const shooters = own.filter((unit) => unit.ranged);
    const rangedSpells = own.filter((unit) => unit.rangedSpellDamage);
    const melee = own.filter((unit) => unit.melee);
    const flyers = own.filter((unit) => unit.canFly);
    const auras = own.filter((unit) => unit.auraCount > 0);
    const hasRangedDamage = shooters.length > 0 || rangedSpells.length > 0;
    const picksLeft = Math.max(0, totalPicks - own.length);
    const notes: PremiumDraftAssessment["notes"] = [];
    const scouting = draft.scouting;
    const paths = scouting ? draftFactionContinuations(draft.picked, draft.opponentPicked, scouting) : [];
    const pressurePath = scouting
        ? draftCreatureContinuation(
              draft.picked,
              draft.opponentPicked,
              scouting,
              (unit) => unit.ranged || unit.rangedSpellDamage,
          )
        : undefined;
    const remaining = scouting?.remainingPickLevels.length
        ? [...new Set(scouting.remainingPickLevels)]
              .map((level) => `L${level} × ${scouting.remainingPickLevels.filter((entry) => entry === level).length}`)
              .join(" · ")
        : undefined;
    const mapName =
        scouting?.map === GridVals.NORMAL
            ? "Normal"
            : scouting?.map === GridVals.LAVA_CENTER
              ? "Lava"
              : scouting?.map === GridVals.BLOCK_CENTER
                ? "Block"
                : undefined;
    const bansComplete = scouting?.knownBanLevels.length === 4;
    const scoutingLine = scouting
        ? `${mapName ? `Map: ${mapName}` : "Map hidden"} · ${bansComplete ? "all bans known" : scouting.knownBanLevels.length ? `bans known for levels ${scouting.knownBanLevels.join(", ")}` : "bans hidden"}`
        : undefined;
    if (scouting) {
        const banned = rosterInfo(scouting.bannedCreatureIds).map((unit) => unit.name);
        notes.push({ label: "Scouting", text: `${scoutingLine}. Information follows your doctrine.` });
        notes.push({
            label: "Bans",
            text: `${banned.length ? banned.join(", ") : "No bans revealed yet"}.${bansComplete ? "" : " Future-level bans are still hidden."}`,
        });
    }
    let headline: string;
    let focus: string;
    if (!own.length) {
        headline = "Your army is still taking shape";
        focus = "Start with a bundle whose creatures and artifact work together.";
    } else if (!hasRangedDamage) {
        headline = "No ranged damage drafted yet";
        focus =
            picksLeft && pressurePath?.maximumCount === 0
                ? "No ranged damage remains in your draft levels under the revealed bans and picks. Plan how to close the gap."
                : picksLeft
                  ? "Look for a shooter or ranged damage spell to add pressure before contact."
                  : "Plan how to close the gap; your army needs contact to deal damage.";
    } else if (!melee.length) {
        headline = "Ranged pressure, little melee cover";
        focus = picksLeft
            ? "Consider a melee creature to help keep enemies off your damage dealers."
            : "Keep your damage dealers protected when arranging the army.";
    } else {
        headline = "Melee and ranged options covered";
        focus = "Build on your synergies while keeping your ranged damage protected.";
    }

    const roles = [
        `${shooters.length} shooter${shooters.length === 1 ? "" : "s"}`,
        `${melee.length} melee`,
        `${own.filter((unit) => unit.caster).length} with spells`,
        `${flyers.length} flyer${flyers.length === 1 ? "" : "s"}`,
    ];
    if (own.length) notes.push({ label: "Army", text: `${roles.join(" · ")}. Roles can overlap.` });
    if (!shooters.length && rangedSpells.length) {
        notes.push({
            label: "Spell pressure",
            text: `${rangedSpells.map((unit) => unit.name).join(", ")} can deal damage at range with spells. Plan around their limited charges.`,
        });
    }

    const variants = draft.gameId ? synergyVariantsForSeed(draft.gameId) : undefined;
    const routes: PremiumDraftRoute[] = paths
        .filter((path) => path.count < 6 && picksLeft > 0)
        .map((path) => {
            const faction = ToFactionName[path.faction];
            const variant = variants?.[faction as keyof typeof variants];
            return {
                faction,
                label: `${faction} ${variant ? (synergyNames[faction]?.[variant - 1] ?? "synergy") : "synergy"} level ${path.nextThreshold / 2}`,
                count: path.count,
                target: path.nextThreshold,
                reachable: path.reachable,
                uncertain: path.uncertain,
                targets: path.creatureIds.flatMap((id) => {
                    const unit = creatureInfo(id);
                    return unit ? [{ id, name: unit.name, level: unit.level }] : [];
                }),
            };
        });
    const pending = paths.filter((path) => path.reachable && path.nextThreshold > path.count);
    const routeWarning =
        scouting &&
        pending.length > 1 &&
        !draftFactionCompletion(
            draft.picked,
            draft.opponentPicked,
            scouting,
            pending.map((path) => ({ faction: path.faction, count: path.nextThreshold })),
        ).reachable
            ? `${pending.map((path) => ToFactionName[path.faction]).join(", ")} routes compete for the same remaining picks. They cannot all be completed.`
            : undefined;
    const factionCounts = new Map<string, number>();
    for (const unit of own) {
        const faction = ToFactionName[unit.faction];
        if (faction && synergyNames[faction]) factionCounts.set(faction, (factionCounts.get(faction) ?? 0) + 1);
    }
    const synergyNotes: string[] = [];
    const gaps: string[] = [];
    for (const [faction, count] of factionCounts) {
        const variant = variants?.[faction as keyof typeof variants];
        const label = variant ? synergyNames[faction][variant - 1] : "synergy";
        const level = Math.min(Math.floor(count / 2), 3);
        if (level) {
            synergyNotes.push(`${faction} ${label} level ${level}`);
            if (faction === "Nature" && variant === 2 && !flyers.length)
                gaps.push("Flying armor has no flying creature to benefit yet.");
            if (faction === "Might" && variant === 1 && !auras.length)
                gaps.push("Aura range has no aura carrier to benefit yet.");
        }
        const next = synergyNextLevel(count);
        if (next?.unitsAway === 1 && picksLeft > 0) {
            const path = paths.find((entry) => ToFactionName[entry.faction] === faction);
            if (path && !path.reachable) {
                gaps.push(`${faction} ${label} level ${next.level} cannot be reached in your remaining picks.`);
            } else if (!scouting) {
                synergyNotes.push(
                    `one more distinct ${faction} creature reaches ${label} level ${next.level}${path?.uncertain ? " if it survives the hidden bans and opposing picks" : path ? " if the opponent leaves a matching creature available" : ""}`,
                );
            }
        }
    }
    if (synergyNotes.length) notes.push({ label: "Synergies", text: `${synergyNotes.join("; ")}.` });
    if (gaps.length) {
        notes.push({ label: "Synergy gap", text: gaps.join(" ") });
        if (hasRangedDamage && melee.length) focus = gaps[0];
    }
    if (routeWarning && hasRangedDamage && melee.length && !gaps.length) focus = routeWarning;

    const enemyRanged = enemy.filter((unit) => unit.ranged || unit.rangedSpellDamage);
    const enemyFlyers = enemy.filter((unit) => unit.canFly);
    const threats: string[] = [];
    if (enemyRanged.length)
        threats.push(
            `${enemyRanged.map((unit) => unit.name).join(", ")} can threaten from range; plan cover or a way to reach them.`,
        );
    if (enemyFlyers.length)
        threats.push(
            `${enemyFlyers.map((unit) => unit.name).join(", ")} can fly; ground obstacles alone will not protect your back line.`,
        );
    notes.push({
        label: "Opponent",
        text: enemy.length
            ? `${enemy.length} revealed creature${enemy.length === 1 ? "" : "s"}. ${threats.join(" ") || "No ranged damage or flyers among the revealed picks."}${enemy.length < totalPicks ? " Other picks may still be hidden." : " Full enemy roster revealed."}`
            : "No enemy creatures revealed yet. Focus on your own composition until there is a matchup to assess.",
    });

    const artifacts = [
        draft.artifactTier1 ? Artifact.getTier1ArtifactProperties(draft.artifactTier1) : undefined,
        draft.artifactTier2 ? Artifact.getTier2ArtifactProperties(draft.artifactTier2) : undefined,
    ].filter((artifact) => artifact !== undefined);
    for (const artifact of artifacts)
        notes.push({ label: artifact.name, text: Artifact.formatArtifactDescription(artifact) });

    return {
        headline,
        focus,
        roster: `${own.length} of ${totalPicks} creatures locked in`,
        scouting: scoutingLine,
        remaining,
        routes,
        routeWarning,
        notes,
    };
};
