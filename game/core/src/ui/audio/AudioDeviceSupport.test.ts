import { expect, mock, test } from "bun:test";

import { listenForAudioActivation } from "./AudioDeviceSupport";

test("audio activation stays available after a later mobile interruption and is removed on teardown", () => {
    const target = new EventTarget();
    const activate = mock(() => {});
    const release = listenForAudioActivation(target, activate);
    target.dispatchEvent(new Event("touchend"));
    target.dispatchEvent(new Event("pointerup"));
    target.dispatchEvent(new Event("keydown"));
    expect(activate).toHaveBeenCalledTimes(3);
    release();
    target.dispatchEvent(new Event("click"));
    expect(activate).toHaveBeenCalledTimes(3);
});
