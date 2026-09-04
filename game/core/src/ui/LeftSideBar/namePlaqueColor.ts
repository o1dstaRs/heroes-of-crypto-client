import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import { teamFlagPalette } from "../../scenes/teamColors";

const NAME_PLAQUE_BACKGROUND_ALPHA = 0.83;
const NAME_PLAQUE_SHADE = 0.9;

const shadedRgba = (color: number, alpha: number): string => {
    const red = Math.round(((color >> 16) & 0xff) * NAME_PLAQUE_SHADE);
    const green = Math.round(((color >> 8) & 0xff) * NAME_PLAQUE_SHADE);
    const blue = Math.round((color & 0xff) * NAME_PLAQUE_SHADE);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

/** The flag's cloth palette, shaded like its digit panel, with seventeen-percent background transparency. */
export const selectedUnitNamePlaqueBackground = (team: TeamType): string => {
    if (team === TeamVals.LEFT || team === TeamVals.RIGHT) {
        const palette = teamFlagPalette(team);
        return `linear-gradient(90deg, ${shadedRgba(palette.edge, NAME_PLAQUE_BACKGROUND_ALPHA)} 0%, ${shadedRgba(palette.center, NAME_PLAQUE_BACKGROUND_ALPHA)} 50%, ${shadedRgba(palette.edge, NAME_PLAQUE_BACKGROUND_ALPHA)} 100%)`;
    }
    return "#1c1916";
};
