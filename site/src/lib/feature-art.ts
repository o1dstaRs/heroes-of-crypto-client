export function featureSpellImage(variant: number): string {
    return variant === 0
        ? "/assets/images/home/features/spells_cinematic.webp"
        : `/assets/images/home/features/spells_variant_${variant}.webp`;
}
