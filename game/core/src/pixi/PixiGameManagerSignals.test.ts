import { expect, mock, test } from "bun:test";
import type { Signal } from "typed-signals";

import { PixiGameManager } from "./PixiGameManager";

test("scene start listeners are released without disconnecting public UI listeners", () => {
    const manager = new PixiGameManager();
    const publicListener = mock(() => undefined);
    const staleSceneListener = mock(() => undefined);
    const sceneSignal = (
        manager as unknown as {
            onSceneHasStarted: Signal<(started: boolean) => void>;
        }
    ).onSceneHasStarted;

    manager.onHasStarted.connect(publicListener);
    sceneSignal.connect(staleSceneListener);

    sceneSignal.emit(true);
    expect(publicListener).toHaveBeenCalledTimes(1);
    expect(staleSceneListener).toHaveBeenCalledTimes(1);

    manager.Uninitialize();
    sceneSignal.emit(false);

    expect(publicListener).toHaveBeenCalledTimes(2);
    expect(staleSceneListener).toHaveBeenCalledTimes(1);
    expect(sceneSignal.getConnectionsCount()).toBe(1);
});
