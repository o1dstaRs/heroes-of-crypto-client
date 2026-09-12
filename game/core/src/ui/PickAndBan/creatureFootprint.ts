export interface CreatureFootprintConfig {
    size: number;
    footprint_width?: number;
    footprint_height?: number;
}

export interface CreatureFootprint {
    width: number;
    height: number;
}

const footprintSide = (side: number | undefined, fallback: number): number =>
    Number.isFinite(side) && (side ?? 0) > 0 ? Math.floor(side as number) : Math.max(1, Math.floor(fallback));

export const creatureFootprint = (config: CreatureFootprintConfig): CreatureFootprint => ({
    width: footprintSide(config.footprint_width, config.size),
    height: footprintSide(config.footprint_height, config.size),
});

export const creatureFootprintLabel = (footprint: CreatureFootprint): string =>
    `${footprint.width}×${footprint.height}`;
