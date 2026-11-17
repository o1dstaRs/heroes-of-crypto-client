import { Artifact, Doctrine, SYNERGY_FACTION_ORDER, TeamVals } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";
import { t } from "../../i18n/i18n";
import type { IFightResultArmySetup, IFightResultSetup } from "../../scenes/VisibleState";
import { getDoctrineCopy, getDoctrineIconImage } from "../doctrineCopy";
import { SYNERGY_KEY_TO_IMAGE } from "../LeftSideBar/SynergiesConstants";
import { synergyEffectAtLevel } from "../LeftSideBar/synergyLadder";
import { teamColor, teamName } from "../FightStats/CasualtyChart";

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

const Choice: React.FC<{ choice: SetupChoice }> = ({ choice }) => (
    <Tooltip
        title={
            <Box sx={{ maxWidth: 300, p: 0.25 }}>
                <Typography level="title-sm">{choice.name}</Typography>
                {choice.detail && <Box sx={{ fontSize: 12 }}>{choice.detail}</Box>}
            </Box>
        }
        placement="top"
        arrow
        enterTouchDelay={0}
    >
        <Box
            component="span"
            tabIndex={0}
            aria-label={`${choice.label}: ${choice.name}`}
            sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, borderRadius: 4 }}
        >
            {choice.image && (
                <Box
                    component="img"
                    src={choice.image}
                    alt=""
                    sx={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
                />
            )}
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 9, color: "#b6a080", textTransform: "uppercase", lineHeight: 1.2 }}>
                    {choice.label}
                </Typography>
                <Typography sx={{ fontSize: 12, color: "#efddbd", fontWeight: 700, lineHeight: 1.2, mt: 0.25 }}>
                    {choice.name}
                </Typography>
            </Box>
        </Box>
    </Tooltip>
);

const ArmySetup: React.FC<{ army: IFightResultArmySetup }> = ({ army }) => (
    <Box
        component="section"
        aria-label={`${teamName(army.team)} ${t("army setup")}`}
        data-result-army={army.team}
        sx={{ minWidth: 0, p: 1, border: `1px solid ${teamColor(army.team)}50`, borderRadius: 6, bgcolor: "#0c0b09b8" }}
    >
        <Typography sx={{ color: teamColor(army.team), fontSize: 10, fontWeight: 800, mb: 0.75 }}>
            {teamName(army.team)}
        </Typography>
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
                gap: 1,
                "& > span:first-of-type": { gridColumn: { xs: "1 / -1", sm: "auto" } },
            }}
        >
            <Choice choice={doctrineChoice(army.doctrine)} />
            <Choice choice={artifactChoice(Artifact.ArtifactTier.TIER_1, army.artifactTier1)} />
            <Choice choice={artifactChoice(Artifact.ArtifactTier.TIER_2, army.artifactTier2)} />
        </Box>
    </Box>
);

/** Read-only match facts. In particular, this must never read the next-game doctrine chooser. */
export const FightSetupSummary: React.FC<{ setup?: IFightResultSetup }> = ({ setup }) => (
    <Box component="section" aria-label={t("Fight setup")} sx={{ textTransform: "none", mb: 1.25, px: 0.25 }}>
        {!setup ? (
            <Typography level="body-xs" sx={{ color: "#b6a080" }}>
                {t("Fight setup not recorded")}
            </Typography>
        ) : (
            <>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.75 }}>
                    {[TeamVals.LEFT, TeamVals.RIGHT].map((team) => (
                        <ArmySetup key={team} army={setup.armies.find((army) => army.team === team) ?? { team }} />
                    ))}
                </Box>
                <Typography sx={{ color: "#cbb388", fontSize: 10, fontWeight: 800, mt: 1, mb: 0.5 }}>
                    {t("Global synergies")} · {t("Shared by both armies")}
                </Typography>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
                        gap: 0.75,
                    }}
                >
                    {SYNERGY_FACTION_ORDER.map((faction) => {
                        const variant = setup.synergyVariants[faction];
                        const label = synergyLabels[`${faction}:${variant}`];
                        return (
                            <Box key={faction} data-result-synergy={faction}>
                                <Choice
                                    choice={{
                                        label: faction,
                                        name: label ? t(label) : t("Not recorded"),
                                        image: (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[
                                            `${faction}:${variant}:1`
                                        ],
                                        // These are global variants. Do not imply either team reached level 1,
                                        // or derive its drafted level from the surviving creatures after the fight.
                                        detail: label ? (
                                            <>
                                                <Typography level="body-xs" sx={{ mb: 0.5 }}>
                                                    {t(
                                                        "Shared by both armies; levels depend on each army's drafted factions.",
                                                    )}
                                                </Typography>
                                                {[1, 2, 3].map((level) => (
                                                    <Typography key={level} level="body-xs" sx={{ mb: 0.5 }}>
                                                        {t("Level")} {level}:{" "}
                                                        {t(synergyEffectAtLevel(faction, variant, level))}
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
            </>
        )}
    </Box>
);
