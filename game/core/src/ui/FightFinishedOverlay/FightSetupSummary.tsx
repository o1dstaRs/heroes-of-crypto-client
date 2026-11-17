import { Artifact, Doctrine, SYNERGY_FACTION_ORDER, type TeamType } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import type { IFightResultArmySetup, IFightResultSetup } from "../../scenes/VisibleState";
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
export const FightArmySetupIcons: React.FC<{ team: TeamType; army?: IFightResultArmySetup }> = ({ team, army }) => (
    <Box
        component="section"
        aria-label={`${teamName(team)} ${t("army setup")}`}
        data-result-army={team}
        sx={{ display: "flex", flexDirection: "column", gap: 0.25, flex: "0 0 28px", textTransform: "none" }}
    >
        <Choice iconOnly choice={doctrineChoice(army?.doctrine)} />
        <Choice iconOnly choice={artifactChoice(Artifact.ArtifactTier.TIER_1, army?.artifactTier1)} />
        <Choice iconOnly choice={artifactChoice(Artifact.ArtifactTier.TIER_2, army?.artifactTier2)} />
    </Box>
);

/** Read-only match facts. In particular, this must never read the next-game doctrine chooser. */
export const FightSetupSummary: React.FC<{ setup?: IFightResultSetup }> = ({ setup }) => (
    <Box
        component="section"
        aria-label={t("Synergies")}
        data-result-global-synergies
        sx={{ display: "flex", flexDirection: "column", gap: 0.75, textTransform: "none", mb: 2 }}
    >
        {SYNERGY_FACTION_ORDER.map((faction) => {
            const variant = setup?.synergyVariants[faction];
            const label = synergyLabels[`${faction}:${variant}`];
            return (
                <Box key={faction} data-result-synergy={faction}>
                    <Choice
                        iconOnly
                        choice={{
                            label: t(faction),
                            name: label ? t(label) : t("Not recorded"),
                            image: (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[`${faction}:${variant}:1`],
                            // Global variants have no shared activation level. Missing legacy data stays
                            // unknown, with compact placeholders rather than borrowing today's choices.
                            detail:
                                label && variant !== undefined ? (
                                    <>
                                        <Typography level="body-xs" sx={{ mb: 0.5 }}>
                                            {t("Shared by both armies; levels depend on each army's drafted factions.")}
                                        </Typography>
                                        {[1, 2, 3].map((level) => (
                                            <Typography key={level} level="body-xs" sx={{ mb: 0.5 }}>
                                                {t("Level")} {level}: {t(synergyEffectAtLevel(faction, variant, level))}
                                            </Typography>
                                        ))}
                                    </>
                                ) : undefined,
                        }}
                    />
                </Box>
            );
        })}
    </Box>
);
