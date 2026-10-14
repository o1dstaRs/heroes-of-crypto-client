export interface PremiumEntitlement {
    active: boolean;
    reason: string;
}
export interface PremiumSnapshot {
    snapshotId: string;
    sourceSha256: string;
    status: string;
    studyProfile: string;
    fights: number;
    caveats?: string[];
    default?: boolean;
}
export interface PremiumRow {
    key: string;
    ids: number[];
    families: number;
    observations: number;
    score: number;
    interval: [number, number];
    frequency: number;
}
export interface PremiumLibrary {
    scope: { cohort: string; map?: number };
    families: number;
    armies: number;
    maps: { map: number; families: number }[];
    units: PremiumRow[];
    pairs: PremiumRow[];
    triples: PremiumRow[];
    artifactsTier1: PremiumRow[];
    artifactsTier2: PremiumRow[];
    synergies: PremiumRow[];
    plans: PremiumRow[];
    doctrines: PremiumRow[];
}
export interface PremiumLibraryResponse {
    entitlement: PremiumEntitlement;
    snapshots: PremiumSnapshot[];
    snapshot?: PremiumSnapshot;
    library: PremiumLibrary | null;
}
export interface PremiumCatalog {
    units: Record<string, { name: string; slug: string; anchor: string; level: number; faction: string }>;
    artifacts: Record<string, { name: string; icon: string; description: string; slug: string; anchor: string }>;
    doctrines: Record<string, { name: string; points: number; description: string }>;
}
export const PREMIUM_COHORTS = [
    "ranked-draft",
    "uniform-mixed",
    "ranged-heavy",
    "ground-melee",
    "flyer-heavy",
    "caster-support",
    "cross-archetype",
] as const;
export const escapePremiumHtml = (value: unknown): string =>
    String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
    );
export const premiumPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;
export function rankPremiumRows(rows: readonly PremiumRow[], minimum: number, sort = "confidence"): PremiumRow[] {
    return rows
        .filter((row) => row.families >= minimum)
        .sort((a, b) => {
            const difference =
                sort === "score"
                    ? b.score - a.score
                    : sort === "frequency"
                      ? b.frequency - a.frequency
                      : b.interval[0] - a.interval[0];
            return difference || b.families - a.families || a.key.localeCompare(b.key);
        });
}
export function premiumPlanLevels(key: string): number[] | null {
    const match = /^P([0-2])-A([0-3])-M([0-3])-S([0-3])-V([0-2])(?:-E([1-3]))?$/.exec(key);
    return match ? match.slice(1).map((value) => Number(value ?? 0)) : null;
}
export function premiumApiUrl(
    resource: "account" | "library",
    options: { hostname: string; protocol: string; api?: string; port?: string; production: boolean },
): string {
    const production =
        options.hostname === "heroesofcrypto.io" ||
        options.hostname.endsWith(".heroesofcrypto.io") ||
        options.production;
    const origin = options.port
        ? `${options.protocol}//${options.hostname}:${options.port}`
        : options.api || (production ? "https://game.heroesofcrypto.io" : "http://localhost:3001");
    return `${origin.replace(/\/+$/, "")}/v1/${production ? "" : "game/"}premium/${resource}`;
}
