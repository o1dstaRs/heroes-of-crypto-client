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
    const [isYourTurn, setIsYourTurn] = useState<boolean | null>(null);
    const [isAbandoned, setIsAbandoned] = useState<boolean | null>(null);
    const [pickPhase, setPickPhase] = useState<number>(-1);
    const [secondsRemaining, setSecondsRemaining] = useState<number>(-1);
    const [revealsRemaining, setRevealsRemaining] = useState<number>(0);
    const [initialBundles, setInitialBundles] = useState<[number, number, number][]>([]);
    const [tier2Offers, setTier2Offers] = useState<number[]>([]);
    const [perk, setPerk] = useState<number>(0);
    const [upgradePoints, setUpgradePoints] = useState<number>(0);
    const [requiredLevel, setRequiredLevel] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

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
            setRequiredLevel(event.lv ?? 0);
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
            isYourTurn,
            isAbandoned,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialBundles,
            tier2Offers,
            perk,
            upgradePoints,
            requiredLevel,
        }),
        [
            isConnected,
            events,
            error,
            banned,
            picked,
            opponentPicked,
            isYourTurn,
            isAbandoned,
            pickPhase,
            secondsRemaining,
            revealsRemaining,
            initialBundles,
            tier2Offers,
            perk,
            upgradePoints,
            requiredLevel,
        ],
    );

    return <PickBanContext.Provider value={contextValue}>{children}</PickBanContext.Provider>;
};
