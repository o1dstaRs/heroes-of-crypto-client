export type FactionName = "Life" | "Nature" | "Chaos" | "Death" | "Might";

export const factionOrder: FactionName[] = ["Chaos", "Life", "Might", "Nature"];

export const factionColors: Record<FactionName, string> = {
    Chaos: "#c63d33",
    Life: "#4ea36e",
    Might: "#e0b04a",
    Nature: "#6f9bd6",
    Death: "#8a76bf",
};
