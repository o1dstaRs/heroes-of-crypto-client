import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { presencePing, respondFriendRequest, type PendingIncomingRequest } from "../../api/social_client";
import { useAuthContext } from "../auth/context/auth_context";

/**
 * App-wide social state: a ~25s presence heartbeat while logged in (this is what makes the player
 * "online" to friends), the notifications badge, pending incoming friend requests, and browser
 * notifications for requests that arrive while the tab is hidden. UI (bell, tray, popup, friends
 * panel) lives in SocialDock — this provider is pure state so it can mount once above the router.
 */

const PING_INTERVAL_MS = 25_000;

interface ISocialContext {
    unseenCount: number;
    pendingIncoming: PendingIncomingRequest[];
    /** Oldest incoming request not yet dismissed this session — drives the accept/decline popup. */
    popupRequest: PendingIncomingRequest | null;
    dismissPopup: (requestId: string) => void;
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
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
    // Requests/counts we already fired a browser notification for — never nag twice per session.
    const notifiedRequestIds = useRef<Set<string>>(new Set());
    const lastUnseenRef = useRef(0);
    const mountedRef = useRef(false);

    const ping = useCallback(async (): Promise<void> => {
        try {
            const result = await presencePing();
            if (!mountedRef.current) {
                return;
            }
            setUnseenCount(result.unseenCount);
            setPendingIncoming(result.pendingIncoming);

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
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        if (!active) {
            setUnseenCount(0);
            setPendingIncoming([]);
            return () => {
                mountedRef.current = false;
            };
        }
        void ping();
        const handle = window.setInterval(() => void ping(), PING_INTERVAL_MS);
        const onVisible = (): void => {
            if (!document.hidden) {
                void ping();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mountedRef.current = false;
            window.clearInterval(handle);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [active, ping]);

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
            respond,
            clearUnseen,
            refreshNow: () => void ping(),
            requestNotificationPermission,
        }),
        [
            unseenCount,
            pendingIncoming,
            popupRequest,
            dismissPopup,
            respond,
            clearUnseen,
            ping,
            requestNotificationPermission,
        ],
    );

    return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
};
