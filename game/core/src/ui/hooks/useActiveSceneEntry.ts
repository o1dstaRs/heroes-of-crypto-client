import { usePixiManager } from "../../pixi/PixiGameManager";

// Helper to pick an active scene; adjust to your registry flow if needed.
export function useActiveSceneEntry() {
    const manager = usePixiManager();
    return manager.flatScenes[0];
}
