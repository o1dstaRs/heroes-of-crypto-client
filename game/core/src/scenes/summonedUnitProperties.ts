import { FactionType, HoCConfig, TeamType, ToFactionName, UnitProperties } from "@heroesofcrypto/common";

import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";

export const createSummonedUnitProperties = (
    team: TeamType,
    faction: FactionType,
    unitName: string,
    amount: number,
): UnitProperties =>
    HoCConfig.getCreatureConfig(
        team,
        ToFactionName[faction],
        unitName,
        unitToTextureName(unitName, TextureType.LARGE),
        amount,
    );
