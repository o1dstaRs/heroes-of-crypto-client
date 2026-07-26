import React, { useEffect, useMemo, useState } from "react";
import { TeamType } from "@heroesofcrypto/common";
import { CustomEventSource } from "@heroesofcrypto/common";
import { IS_PROD } from "../env";
import { IPickPhaseEventData, PickBanContext } from "./PickBanContextDefs";

export { usePickBanEvents } from "./PickBanContextDefs";
export type { IPickPhaseEventData };

export const PickBanEventProvider: React.FC<{
    children: React.ReactNode;
    url: string;
    userTeam: TeamType;
}> = ({ children, url, userTeam }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [events, setEvents] = useState<IPickPhaseEventData[]>([]);
    const [banned, setBanned] = useState<number[]>([]);
    const [picked, setPicked] = useState<number[]>([]);
    const [opponentPicked, setOpponentPicked] = useState<number[]>([]);
    const [watchedSlots, setWatchedSlots] = useState<number[]>([]);
    const [isYourTurn, setIsYourTurn] = useState<boolean | null>(null);
    const [isAbandoned, setIsAbandoned] = useState<boolean | null>(null);
    const [pickPhase, setPickPhase] = useState<number>(-1);
    const [secondsRemaining, setSecondsRemaining] = useState<number>(-1);
    const [revealsRemaining, setRevealsRemaining] = useState<number>(0);
    const [initialBundles, setInitialBundles] = useState<[number, number, number][]>([]);
    const [tier2Offers, setTier2Offers] = useState<number[]>([]);
    const [perk, setPerk] = useState<number>(0);
    const [upgradePoints, setUpgradePoints] = useState<number>(0);
    const [artifactTier1, setArtifactTier1] = useState<number>(0);
    const [artifactTier2, setArtifactTier2] = useState<number>(0);
    const [requiredLevel, setRequiredLevel] = useState<number>(0);
    const [mapType, setMapType] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [autoPickedSignal, setAutoPickedSignal] = useState<number>(0);

    useEffect(() => {
        const STORAGE_KEY = "accessToken";

        const getCookie = (name: string) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(";").shift();
            return undefined;
        };

        const refreshLocalStorageFromCookie = () => {
            const accessTokenCookie = getCookie(STORAGE_KEY);
            if (accessTokenCookie) {
                localStorage.setItem(STORAGE_KEY, accessTokenCookie);
            }
        };
        refreshLocalStorageFromCookie();

        const token = localStorage.getItem(STORAGE_KEY);

        // Create SSE connection
        const eventSource = new CustomEventSource<IPickPhaseEventData>(url, {
            token: token ?? undefined,
            debug: !IS_PROD ? false : false,
        });

        eventSource.onmessage = (event: IPickPhaseEventData) => {
            setEvents((prevEvents) => [...prevEvents, event]);
            setIsConnected(true);
            setBanned(event.b);
            setPicked(event.p);
            setOpponentPicked(event.op);
            setWatchedSlots(event.ws ?? []);
            setPickPhase(event.pp);
            setIsYourTurn(event.a.includes(userTeam));
            setIsAbandoned(event.ia);
            setSecondsRemaining(Math.ceil(event.t / 1000));
            setRevealsRemaining(event.r);
            setError(null);
            setInitialBundles(event.ip);
            setTier2Offers(event.t2 ?? []);
            setPerk(event.pk ?? 0);
            setUpgradePoints(event.up ?? 0);
            // event.art is [tier, artifactId] pairs (tier 1 or 2); split into the two slots for display.
            const artifacts = event.art ?? [];
            setArtifactTier1(artifacts.find((pair) => pair[0] === 1)?.[1] ?? 0);
            setArtifactTier2(artifacts.find((pair) => pair[0] === 2)?.[1] ?? 0);
            setRequiredLevel(event.lv ?? 0);
            // The server reveals the map from the L3 picks onward and sends it on every frame after that.
            // Latch it (never clear back to "?") so a stray/reordered frame can't un-reveal the map.
            if (event.mt) {
                setMapType(event.mt);
            }
            if (event.ap) {
                setAutoPickedSignal((prev) => prev + 1);
            }
        };

        eventSource.onerror = (error: Error) => {
            console.error("SSE Connection Error:", error);
            setError(error.message);
            setIsConnected(false);
        };

        // Cleanup on unmount
        return () => {
            eventSource.close();
        };
    }, [url, userTeam]);

    // Memoize context value to prevent unnecessary re-renders
    const contextValue = useMemo(
        () => ({
            isConnected,
            events,
            error,
            banned,
            picked,
            opponentPicked,
            watchedSlots,
            isYourTurn,
            isAbandoned,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialBundles,
            tier2Offers,
            perk,
            upgradePoints,
            artifactTier1,
            artifactTier2,
            requiredLevel,
            mapType,
            autoPickedSignal,
        }),
        [
            isConnected,
            events,
            error,
            banned,
            picked,
            opponentPicked,
            watchedSlots,
            isYourTurn,
            isAbandoned,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialBundles,
            tier2Offers,
            perk,
            upgradePoints,
            artifactTier1,
            artifactTier2,
            requiredLevel,
            mapType,
            autoPickedSignal,
        ],
    );

    return <PickBanContext.Provider value={contextValue}>{children}</PickBanContext.Provider>;
};
