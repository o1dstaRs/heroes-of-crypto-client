import approvedProfile from "./approvedAnimationProfile.json";
/** The local server injects this independent, disk-backed profile before the game loads. */
type ProfileValue = string | number;
type Profile = Record<string, ProfileValue>;
const host = globalThis as typeof globalThis & { __HOC_ANIMATION_PROFILE__?: Profile };
export const ANIMATION_PROFILE_ENDPOINT = "/__hoc-dev/animation-profile";
export const ANIMATION_PROFILE_EVENT = "hoc-animation-profile-save";
export const hasLocalAnimationProfile = (): boolean => !!host.__HOC_ANIMATION_PROFILE__;
export function readAnimationSetting<T extends ProfileValue>(key: string, fallback: T): T {
    const value = host.__HOC_ANIMATION_PROFILE__?.[key] ?? (approvedProfile.values as Profile)[key];
    return typeof value === typeof fallback ? (value as T) : fallback;
}

let pending = Promise.resolve();
/** Only explicit edits write to disk. Loading a page never replaces the saved profile with defaults. */
export function saveAnimationSetting(key: string, value: ProfileValue): void {
    if (!host.__HOC_ANIMATION_PROFILE__) return;
    host.__HOC_ANIMATION_PROFILE__[key] = value;
    const notify = (state: string) =>
        globalThis.dispatchEvent(new CustomEvent(ANIMATION_PROFILE_EVENT, { detail: state }));
    notify("saving");
    pending = pending.then(async () => {
        try {
            const response = await fetch(ANIMATION_PROFILE_ENDPOINT, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, value }),
            });
            if (!response.ok) throw new Error(`Profile save failed: ${response.status}`);
            notify("saved");
        } catch (error) {
            notify("error");
            console.error("Animation settings were not saved to the local profile", error);
        }
    });
}
