/**
 * Short interface sounds, played from files under public/audio (a WebM/Opus source with an MP3 fallback,
 * the same pairing the theme music ships as). Three today:
 *
 *   notification  — something new landed in the tray (a message, a chat reply, a system note)
 *   friend_invite — a friend asked for you: a friend request, a lobby invite, a sandbox invite
 *   ui_popup      — a dock panel opened on a click (notifications, friends, bets, a conversation)
 *
 * Framework-free on purpose, like chipSounds: the notification sounds fire from the presence poll with
 * no React around them. Volume rides the EFFECTS level from the player's settings (effectsGain), never the
 * music's. A play() the browser refuses (no user gesture yet on a fresh tab) is swallowed — a sound that
 * cannot play is not an error the player should see, and the very next click unlocks the page anyway.
 */

import { effectsGain } from "../../settings/audioLevels";

export type UiSoundName = "notification" | "friend_invite" | "ui_popup";

const SOURCES: Record<UiSoundName, { webm: string; mp3: string }> = {
    notification: { webm: "/audio/notification.webm", mp3: "/audio/notification.mp3" },
    friend_invite: { webm: "/audio/friend_invite.webm", mp3: "/audio/friend_invite.mp3" },
    ui_popup: { webm: "/audio/ui_popup.webm", mp3: "/audio/ui_popup.mp3" },
};

/** Per-sound loudness trim on top of the effects level, so a fanfare does not shout over a click. */
const TRIM: Record<UiSoundName, number> = {
    notification: 0.9,
    friend_invite: 1,
    ui_popup: 0.7,
};

interface IUiSoundElement {
    src: string;
    volume: number;
    currentTime: number;
    preload: string;
    canPlayType(type: string): string;
    play(): Promise<void> | void;
}

export interface IUiSoundPlayerDeps {
    createElement: () => IUiSoundElement;
    gain: () => number;
}

/** Which file an element can play: the Opus source when the browser says so, else the MP3. */
export const pickUiSoundSource = (
    canPlayType: (type: string) => string,
    sources: { webm: string; mp3: string },
): string => (canPlayType('audio/webm; codecs="opus"') ? sources.webm : sources.mp3);

export const createUiSoundPlayer = (deps: IUiSoundPlayerDeps): ((name: UiSoundName) => boolean) => {
    const elements = new Map<UiSoundName, IUiSoundElement>();
    const elementFor = (name: UiSoundName): IUiSoundElement => {
        const existing = elements.get(name);
        if (existing) {
            return existing;
        }
        const element = deps.createElement();
        element.preload = "auto";
        element.src = pickUiSoundSource((type) => element.canPlayType(type), SOURCES[name]);
        elements.set(name, element);
        return element;
    };
    return (name) => {
        const volume = Math.max(0, Math.min(1, deps.gain() * TRIM[name]));
        if (volume <= 0) {
            return false;
        }
        let element: IUiSoundElement;
        try {
            element = elementFor(name);
            element.volume = volume;
            element.currentTime = 0;
        } catch {
            return false;
        }
        try {
            const outcome = element.play();
            if (outcome && typeof (outcome as Promise<void>).catch === "function") {
                void (outcome as Promise<void>).catch(() => undefined);
            }
        } catch {
            return false;
        }
        return true;
    };
};

let player: ((name: UiSoundName) => boolean) | undefined;

/** Play one interface sound at the player's effects level. Safe to call anywhere; no-op without a DOM. */
export const playUiSound = (name: UiSoundName): boolean => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
        return false;
    }
    player ??= createUiSoundPlayer({ createElement: () => new Audio(), gain: effectsGain });
    return player(name);
};

export const playNotificationSound = (): boolean => playUiSound("notification");
export const playFriendInviteSound = (): boolean => playUiSound("friend_invite");
export const playUiPopupSound = (): boolean => playUiSound("ui_popup");
