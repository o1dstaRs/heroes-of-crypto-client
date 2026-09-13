import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
    fetchNotifications,
    isFriendInviteNotification,
    presencePing,
    respondFriendRequest,
    type FriendGameStage,
    type PendingIncomingRequest,
    type SocialNotification,
} from "../../api/social_client";
import { playFriendInviteSound, playNotificationSound } from "../audio/uiSounds";
import { useAuthContext } from "../auth/context/auth_context";
import { currentPresenceAttention, presencePingIntervalMs } from "./presenceCadence";

/**
 * App-wide social state: a ~25s presence heartbeat while logged in (this is what makes the player
 * "online" to friends), the notifications badge, pending incoming friend requests, and browser
 * notifications for requests that arrive while the tab is hidden. UI (bell, tray, popup, friends
 * panel) lives in SocialDock — this provider is pure state so it can mount once above the router.
 */

export interface ILiveGame {
    gameId: string;
    stage: FriendGameStage;
}

interface ISocialContext {
    unseenCount: number;
    pendingIncoming: PendingIncomingRequest[];
    /** Oldest incoming request not yet dismissed this session — drives the accept/decline popup. */
    popupRequest: PendingIncomingRequest | null;
    dismissPopup: (requestId: string) => void;
    /** The newest sandbox/lobby invite that arrived this session and was not acted on — drives the Join toast. */
    inviteToast: SocialNotification | null;
    dismissInviteToast: () => void;
    /** The viewer's own live ranked/lobby game, as the last presence ping reported it. */
    liveGame: ILiveGame | null;
    respond: (requestId: string, accept: boolean) => Promise<void>;
    /** Zero the badge locally (the tray marks seen server-side when opened). */
    clearUnseen: () => void;
    refreshNow: () => void;
    requestNotificationPermission: () => void;
}

const SocialContext = createContext<ISocialContext>({
    unseenCount: 0,
    pendingIncoming: [],
    popupRequest: null,
    dismissPopup: () => {},
    inviteToast: null,
    dismissInviteToast: () => {},
    liveGame: null,
    respond: async () => {},
    clearUnseen: () => {},
    refreshNow: () => {},
    requestNotificationPermission: () => {},
});

export const useSocial = (): ISocialContext => useContext(SocialContext);

const canNotify = (): boolean => typeof Notification !== "undefined" && Notification.permission === "granted";

export const SocialProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const { authenticated, user } = useAuthContext();
    const active = authenticated && user?.is_active !== false;

    const [unseenCount, setUnseenCount] = useState(0);
    const [pendingIncoming, setPendingIncoming] = useState<PendingIncomingRequest[]>([]);
    const [inviteToast, setInviteToast] = useState<SocialNotification | null>(null);
    const [liveGame, setLiveGame] = useState<ILiveGame | null>(null);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
    // Requests/counts we already fired a browser notification for — never nag twice per session.
    const notifiedRequestIds = useRef<Set<string>>(new Set());
    const lastUnseenRef = useRef(0);
    const mountedRef = useRef(false);
    // Sound cues: the first ping after sign-in only establishes the baseline (a backlog of unseen items
    // is not "news"); afterwards a badge that grew means something arrived. Which sound plays depends on
    // WHAT arrived, so the newest unseen entries are fetched and classified — a friend asking for you
    // (request, lobby or sandbox invite) gets the invite fanfare, anything else the plain chime.
    const pingedOnceRef = useRef(false);
    const lastSoundedCreatedAtRef = useRef(0);

    const soundNewArrivals = useCallback(async (): Promise<void> => {
        try {
            const { notifications } = await fetchNotifications();
            const fresh = notifications.filter(
                (notification) => notification.seenAt === 0 && notification.createdAt > lastSoundedCreatedAtRef.current,
            );
            if (!fresh.length) {
                return;
            }
            lastSoundedCreatedAtRef.current = Math.max(...fresh.map((notification) => notification.createdAt));
            if (fresh.some((notification) => isFriendInviteNotification(notification.type))) {
                playFriendInviteSound();
            } else {
                playNotificationSound();
            }
            // A room invite is time-sensitive: raise the Join toast for the newest one that has a room to go to.
            const invite = fresh.find(
                (notification) =>
                    (notification.type === "sandbox_invite" && !!notification.sandboxId) ||
                    (notification.type === "lobby_invite" && !!notification.lobbyId),
            );
            if (invite) {
                setInviteToast(invite);
            }
        } catch {
            // The badge already tells the story; a missed chime is not worth an error.
        }
    }, []);

    const ping = useCallback(async (): Promise<void> => {
        try {
            const result = await presencePing();
            if (!mountedRef.current) {
                return;
            }
            setUnseenCount(result.unseenCount);
            setPendingIncoming(result.pendingIncoming);
            setLiveGame((current) => {
                const next = result.liveGame ?? null;
                return current?.gameId === next?.gameId && current?.stage === next?.stage ? current : next;
            });
            if (pingedOnceRef.current && result.unseenCount > lastUnseenRef.current) {
                void soundNewArrivals();
            } else if (!pingedOnceRef.current) {
                lastSoundedCreatedAtRef.current = Date.now();
            }
            pingedOnceRef.current = true;

            // Browser notifications: only for things the player hasn't been shown yet, and only
            // when the tab isn't the thing they're looking at (the in-app popup covers that case).
            const hidden = document.hidden || !document.hasFocus();
            if (canNotify() && hidden) {
                for (const request of result.pendingIncoming) {
                    if (!notifiedRequestIds.current.has(request.requestId)) {
                        notifiedRequestIds.current.add(request.requestId);
                        try {
                            const notification = new Notification("Heroes of Crypto — friend request", {
                                body: `${request.fromUsername} wants to add you as a friend`,
                                tag: request.requestId,
                            });
                            notification.onclick = () => window.focus();
                        } catch {
                            /* some browsers require a service worker; the in-app tray still works */
                        }
                    }
                }
                if (result.unseenCount > lastUnseenRef.current && result.pendingIncoming.length === 0) {
                    try {
                        const notification = new Notification("Heroes of Crypto", {
                            body: `You have ${result.unseenCount} new notification${result.unseenCount === 1 ? "" : "s"}`,
                            tag: "hoc-unseen",
                        });
                        notification.onclick = () => window.focus();
                    } catch {
                        /* ignore */
                    }
                }
            }
            lastUnseenRef.current = result.unseenCount;
        } catch {
            // Silent: presence is a heartbeat; one missed beat is irrelevant and transient network
            // failures here must never surface as UI errors.
        }
    }, [soundNewArrivals]);

    useEffect(() => {
        mountedRef.current = true;
        if (!active) {
            setUnseenCount(0);
            setPendingIncoming([]);
            setInviteToast(null);
            setLiveGame(null);
            pingedOnceRef.current = false;
            return () => {
                mountedRef.current = false;
            };
        }
        // The cadence follows the tab's attention (see presenceCadence): a watched tab polls briskly so an
        // invite or a badge never waits long, a hidden one keeps the cheap heartbeat. Attention changes
        // re-arm the timer and, when the tab comes back, ping right away.
        let handle: number | undefined;
        let stopped = false;
        const arm = (): void => {
            if (stopped) {
                return;
            }
            window.clearTimeout(handle);
            handle = window.setTimeout(() => {
                void ping().finally(arm);
            }, presencePingIntervalMs(currentPresenceAttention()));
        };
        void ping().finally(arm);
        const onAttention = (): void => {
            if (!document.hidden) {
                void ping().finally(arm);
            } else {
                arm();
            }
        };
        document.addEventListener("visibilitychange", onAttention);
        window.addEventListener("focus", onAttention);
        window.addEventListener("blur", onAttention);
        return () => {
            stopped = true;
            mountedRef.current = false;
            window.clearTimeout(handle);
            document.removeEventListener("visibilitychange", onAttention);
            window.removeEventListener("focus", onAttention);
            window.removeEventListener("blur", onAttention);
        };
    }, [active, ping]);

    const dismissInviteToast = useCallback((): void => setInviteToast(null), []);

    const respond = useCallback(
        async (requestId: string, accept: boolean): Promise<void> => {
            await respondFriendRequest(requestId, accept);
            setPendingIncoming((current) => current.filter((request) => request.requestId !== requestId));
            void ping();
        },
        [ping],
    );

    const dismissPopup = useCallback((requestId: string): void => {
        setDismissedIds((current) => {
            const next = new Set(current);
            next.add(requestId);
            return next;
        });
    }, []);

    const clearUnseen = useCallback((): void => {
        setUnseenCount(0);
        lastUnseenRef.current = 0;
    }, []);

    const refreshNow = useCallback((): void => {
        void ping();
    }, [ping]);

    const requestNotificationPermission = useCallback((): void => {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
        }
    }, []);

    const popupRequest = useMemo(
        () => pendingIncoming.find((request) => !dismissedIds.has(request.requestId)) ?? null,
        [pendingIncoming, dismissedIds],
    );

    const value = useMemo<ISocialContext>(
        () => ({
            unseenCount,
            pendingIncoming,
            popupRequest,
            dismissPopup,
            inviteToast,
            dismissInviteToast,
            liveGame,
            respond,
            clearUnseen,
            refreshNow,
            requestNotificationPermission,
        }),
        [
            unseenCount,
            pendingIncoming,
            popupRequest,
            dismissPopup,
            inviteToast,
            dismissInviteToast,
            liveGame,
            respond,
            clearUnseen,
            refreshNow,
            requestNotificationPermission,
        ],
    );

    return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
};
