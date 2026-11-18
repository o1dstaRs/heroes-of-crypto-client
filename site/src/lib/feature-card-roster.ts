import roster from '../data/feature-roster.json';

/** Image URLs and labels come from the bundled roster, never mutable DOM text. */
export const FEATURE_CARD_ROSTER = roster;

export function resolveFeatureCardUnit(faction: number, creature: unknown) {
    if (!Number.isInteger(faction) || faction < 0 || typeof creature !== 'string') return;
    return roster[faction]?.units.find(unit => unit.slug === creature);
}
