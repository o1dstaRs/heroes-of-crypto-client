import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { approvedBrowserPreferencesScript } from "./approved_browser_preferences";
import { resolveAnimationProfileDirectory } from "./animation_lab_profile";
import { readAnimationSetting } from "../src/settings/animationLabProfile";

test("a clean browser gets approved preferences before game startup, existing choices survive", () => {
    const values = new Map<string, string>([["hoc:soundVolume", "0.7"]]);
    const localStorage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
    };
    runInNewContext(approvedBrowserPreferencesScript(), { localStorage });
    expect(values.get("hoc.fire-spell-render-mode.v1")).toBe("particles");
    expect(values.get("hoc:soundVolume")).toBe("0.7");
    expect(values.get("hoc:themeMuted")).toBe("1");
    expect(values.has("accessToken")).toBe(false);
    expect(() => runInNewContext(approvedBrowserPreferencesScript(), {})).not.toThrow();
});

test("approved animation settings work without a development server or a personal profile", () => {
    expect(readAnimationSetting("stone.playbackRate", 1)).toBe(1.6);
    expect(readAnimationSetting("stone.settledHoldMs", 500)).toBe(30);
    expect(readAnimationSetting("cyclops.impactMode", "sprites")).toBe("engine");
    expect(readAnimationSetting("unknown", 123)).toBe(123);
});

test("animation profiles follow explicit portable asset locations", () => {
    expect(resolveAnimationProfileDirectory({ HOC_IMAGES_LOC: "/portable/assets/images" })).toBe(
        "/portable/assets/config/creature-animation-lab",
    );
    expect(
        resolveAnimationProfileDirectory({
            HOC_ANIMATION_PROFILE_DIR: "/portable/profile",
            HOC_IMAGES_LOC: "/assets/images",
        }),
    ).toBe("/portable/profile");
});
