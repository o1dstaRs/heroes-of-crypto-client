import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useState } from "react";

import { currentPremiumSearchMatch, type PremiumSearchMatchVersion } from "./premiumSearchFreshness";

const Versions = createContext<ReadonlyMap<string, PremiumSearchMatchVersion>>(new Map());
const ReportVersion = createContext<(owner: string, version?: PremiumSearchMatchVersion) => void>(() => {});

export const PremiumSearchMatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [versions, setVersions] = useState<ReadonlyMap<string, PremiumSearchMatchVersion>>(new Map());
    const report = useCallback((owner: string, version?: PremiumSearchMatchVersion) => {
        setVersions((previous) => {
            const next = new Map(previous);
            if (version) next.set(owner, version);
            else next.delete(owner);
            return next;
        });
    }, []);
    return (
        <ReportVersion.Provider value={report}>
            <Versions.Provider value={versions}>{children}</Versions.Provider>
        </ReportVersion.Provider>
    );
};

export const useReportPremiumSearchMatch = (
    gameId: string | undefined,
    source: PremiumSearchMatchVersion["source"],
    key?: string,
): void => {
    const report = useContext(ReportVersion);
    const owner = useId();
    useLayoutEffect(() => {
        if (!gameId || key === undefined) return;
        report(owner, { gameId, source, key });
        return () => report(owner);
    }, [gameId, source, key, owner, report]);
};

export const usePremiumSearchMatch = (gameId?: string): PremiumSearchMatchVersion | undefined =>
    currentPremiumSearchMatch(useContext(Versions).values(), gameId);
