import { Artifact, Doctrine, SYNERGY_FACTION_ORDER, type TeamType } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import type { IFightResultArmySetup } from "../../scenes/VisibleState";
import { getDoctrineCopy, getDoctrineIconImage } from "../doctrineCopy";
import { SYNERGY_KEY_TO_IMAGE } from "../LeftSideBar/SynergiesConstants";
import { synergyEffectAtLevel } from "../LeftSideBar/synergyLadder";
import { teamName } from "../FightStats/CasualtyChart";

const synergyLabels: Record<string, string> = {
    "Life:1": "Supply",
    "Life:2": "Morale & luck",
    "Nature:1": "Board units",
    "Nature:2": "Flying armor",
    "Chaos:1": "Movement",
    "Chaos:2": "Break on attack",
    "Might:1": "Aura range",
    "Might:2": "Abilities power",
};

interface SetupChoice {
    label: string;
    name: string;
    image?: string;
    detail?: React.ReactNode;
}

const doctrineChoice = (id?: number): SetupChoice => {
    const props = id === undefined ? undefined : Doctrine.DOCTRINES[id as Doctrine.Doctrine];
    const copy = id === undefined ? undefined : getDoctrineCopy(id);
    return {
        label: t("Doctrine"),
        name: props ? t(props.name) : id === undefined ? t("Not recorded") : `${t("Unknown doctrine")} (${id})`,
        image: id === undefined ? undefined : getDoctrineIconImage(id),
        detail: props ? t(copy?.detail ?? props.description) : undefined,
    };
};

const artifactChoice = (tier: Artifact.ArtifactTier, id?: number): SetupChoice => {
    const props = id === undefined ? undefined : Artifact.getArtifactProperties(tier, id);
    // The engine getter falls back to NO_ARTIFACT for an unknown future id; don't mislabel that as none.
    const known = props?.id === id ? props : undefined;
    return {
        label: t(tier === Artifact.ArtifactTier.TIER_1 ? "Tier 1 artifact" : "Tier 2 artifact"),
        name: known ? t(known.name) : id === undefined ? t("Not recorded") : `${t("Unknown artifact")} (${id})`,
        image: known ? (images as Record<string, string>)[known.imageKey] : undefined,
        detail: known ? t(Artifact.formatArtifactDescription(known)) : undefined,
    };
};

const Choice: React.FC<{ choice: SetupChoice; iconOnly?: boolean }> = ({ choice, iconOnly = false }) => (
    <Tooltip
        title={
            <Box sx={{ maxWidth: 300, p: 0.25 }}>
                <Typography level="body-xs" sx={{ color: "#b6a080" }}>
                    {choice.label}
                </Typography>
                <Typography level="title-sm">{choice.name}</Typography>
                {choice.detail && <Box sx={{ fontSize: 12 }}>{choice.detail}</Box>}
            </Box>
        }
        placement="top"
        arrow
        enterTouchDelay={0}
        // Results sit above the board chrome; their hover cards must sit above the results too.
        sx={{ zIndex: 10001 }}
    >
        <Box
            component="span"
            tabIndex={0}
            aria-label={`${choice.label}: ${choice.name}`}
            data-result-choice={iconOnly ? "icon" : undefined}
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: iconOnly ? "center" : undefined,
                gap: 0.75,
                minWidth: 0,
                borderRadius: 4,
                width: iconOnly ? 28 : undefined,
                height: iconOnly ? 28 : undefined,
                flexShrink: iconOnly ? 0 : undefined,
                "&:focus-visible": { outline: "2px solid #dcb158", outlineOffset: 2 },
            }}
        >
            {choice.image ? (
                <Box
                    component="img"
                    src={choice.image}
                    alt=""
                    sx={{ width: iconOnly ? 28 : 36, height: iconOnly ? 28 : 36, objectFit: "contain", flexShrink: 0 }}
                />
            ) : iconOnly ? (
                <Typography aria-hidden sx={{ color: "#b6a080", fontSize: 18 }}>
                    —
                </Typography>
            ) : null}
            {!iconOnly && (
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 9, color: "#b6a080", textTransform: "uppercase", lineHeight: 1.2 }}>
                        {choice.label}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#efddbd", fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>
                        {choice.name}
                    </Typography>
                </Box>
            )}
        </Box>
    </Tooltip>
);

/** Compact build icons sit on the outer edge of each army; names and effects stay in the hovers. */
export const FightArmySetupIcons: React.FC<{ team: TeamType; army?: IFightResultArmySetup }> = ({ team, army }) => {
    const choices = [
        army?.doctrine ? doctrineChoice(army.doctrine) : undefined,
        army?.artifactTier1 ? artifactChoice(Artifact.ArtifactTier.TIER_1, army.artifactTier1) : undefined,
        army?.artifactTier2 ? artifactChoice(Artifact.ArtifactTier.TIER_2, army.artifactTier2) : undefined,
    ].filter((choice): choice is SetupChoice => !!choice);
    if (!choices.length) return null;
    return (
        <Box
            component="section"
            aria-label={`${teamName(team)} ${t("army setup")}`}
            data-result-army={team}
            sx={{ display: "flex", flexDirection: "column", gap: 0.25, flex: "0 0 28px", textTransform: "none" }}
        >
            {choices.map((choice) => (
                <Choice key={choice.label} iconOnly choice={choice} />
            ))}
        </Box>
    );
};

const synergyColors: Record<string, string> = {
    Life: "#d5a74a",
    Nature: "#51b660",
    Chaos: "#d85c28",
    Might: "#d3261f",
};

/** Each army keeps its recorded active levels, even when none of its faction stacks survived. */
export const FightArmySynergies: React.FC<{ team: TeamType; army?: IFightResultArmySetup }> = ({ team, army }) => {
    const active = SYNERGY_FACTION_ORDER.flatMap((faction) => {
        const key = army?.synergies?.find((entry) => new RegExp(`^${faction}:[12]:[123]$`).test(entry));
        if (!key) return [];
        const [, variant, level] = key.split(":").map((value) => Number(value));
        return [{ key, faction, variant, level }];
    });
    // Old recordings have no per-army levels. Never guess from the global variants or final survivors.
    if (!active.length) return null;
    return (
        <Box
            component="section"
            aria-label={`${teamName(team)} ${t("Synergies")}`}
            data-result-army-synergies={team}
            sx={{ display: "flex", justifyContent: "center", gap: 1.25, mb: 1, textTransform: "none" }}
        >
            {active.map(({ key, faction, variant, level }) => (
                <Box
                    key={key}
                    data-result-synergy={key}
                    sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}
                >
                    <Choice
                        iconOnly
                        choice={{
                            label: t(faction),
                            name: `${t(synergyLabels[`${faction}:${variant}`])} · ${t("Level")} ${level}`,
                            image: (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[key],
                            detail: t(synergyEffectAtLevel(faction, variant, level)),
                        }}
                    />
                    <Box aria-hidden sx={{ display: "flex", gap: "3px", height: 4 }}>
                        {Array.from({ length: level }, (_, index) => (
                            <Box
                                key={index}
                                data-result-synergy-dot
                                sx={{
                                    width: 4,
                                    height: 4,
                                    borderRadius: "50%",
                                    backgroundColor: synergyColors[faction],
                                    boxShadow: `0 0 3px ${synergyColors[faction]}66`,
                                }}
                            />
                        ))}
                    </Box>
                </Box>
            ))}
        </Box>
    );
};
