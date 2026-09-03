import type { SceneConstructor, SceneEntry, SceneGroup } from "./PixiScene";

// Keep scene discovery independent from PixiScene's runtime. PixiGameManager is constructed by the
// app shell on menus, login, lobby and profile routes; importing the registry through PixiScene made
// those non-battle routes download Pixi's renderer/filter graph before a canvas existed.
const sceneGroups = {
    Heroes: [] as SceneEntry[],
};

export function registerScene(group: SceneGroup, name: string, constructor: SceneConstructor): void {
    sceneGroups[group].push({
        group,
        name,
        SceneClass: constructor,
    });
}

export function getScenesGrouped(): Array<{ name: string; scenes: SceneEntry[] }> {
    return Object.keys(sceneGroups)
        .sort()
        .map((name) => {
            const scenes = sceneGroups[name as SceneGroup].sort((a, b) => (a.name < b.name ? -1 : 1));
            return { name, scenes };
        });
}
