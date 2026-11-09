import { PremiumSearchMatchProvider } from "./PremiumSearchMatchContext";
import { PremiumSearchPromptContext, type PremiumInspectionFocus } from "./PremiumSearchPromptContext";
import { PremiumTurnPreviewProvider } from "./PremiumTurnPreviewContext";
import { PremiumGuide } from "./PremiumGuide";
import { PremiumAccessProvider } from "./PremiumAccess";
import { useAuthContext } from "../auth/context/auth_context";
import { premiumSearchGameId } from "../../api/premium_search";
import { Box } from "@mui/joy";
import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

const SetAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const PREMIUM_SEARCH_HEIGHT_PX = 44;
const SetDockAnchorContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
const DockVisibleContext = createContext(false);
const SearchVisibleContext = createContext(false);
const SetSearchVisibleContext = createContext<(visible: boolean) => void>(() => {});

export interface PremiumSearchPrompt {
    question: string;
    focus?: PremiumInspectionFocus;
    pathname: string;
    accountKey?: string;
}

/** True once the Premium guide has an answer surface. */
export const usePremiumSearchVisible = (): boolean => useContext(SearchVisibleContext);

/**
 * The guide is available from menus, draft, setup, placement and the bottom-right fight footer.
 * The fight's suggested-moves preference controls board drawings independently of the strategy briefing.
 */
export const PremiumSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
    const [dockAnchor, setDockAnchor] = useState<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(false);
    const [prompt, setPrompt] = useState<PremiumSearchPrompt>();
    const { pathname } = useLocation();
    const { user } = useAuthContext();
    const accountKey = user?.email || user?.username;
    const prefill = useCallback(
        (question: string, focus?: PremiumInspectionFocus) => setPrompt({ question, focus, pathname, accountKey }),
        [pathname, accountKey],
    );
    useLayoutEffect(() => setPrompt(undefined), [pathname, accountKey, visible]);
    return (
        <PremiumAccessProvider>
            <PremiumTurnPreviewProvider scope={JSON.stringify([pathname, accountKey])}>
                <SetAnchorContext.Provider value={setAnchor}>
                    <SetSearchVisibleContext.Provider value={setVisible}>
                        <SearchVisibleContext.Provider value={visible}>
                            <PremiumSearchMatchProvider>
                                <SetDockAnchorContext.Provider value={setDockAnchor}>
                                    <DockVisibleContext.Provider value={visible && !anchor}>
                                        <PremiumSearchPromptContext.Provider
                                            value={visible && premiumSearchGameId(pathname) ? prefill : undefined}
                                        >
                                            <PremiumGuide
                                                onAvailabilityChange={setVisible}
                                                anchor={anchor ?? dockAnchor}
                                                compact={Boolean(anchor) || pathname.startsWith("/game/")}
                                                prompt={prompt}
                                            />
                                            {children}
                                        </PremiumSearchPromptContext.Provider>
                                    </DockVisibleContext.Provider>
                                </SetDockAnchorContext.Provider>
                            </PremiumSearchMatchProvider>
                        </SearchVisibleContext.Provider>
                    </SetSearchVisibleContext.Provider>
                </SetAnchorContext.Provider>
            </PremiumTurnPreviewProvider>
        </PremiumAccessProvider>
    );
};

/** Inline placement panels reserve space for the guide; the sandbox row anchors it beside Invite. */
export const PremiumSearchSlot: React.FC<{ inline?: boolean }> = ({ inline = false }) => {
    const setAnchor = useContext(SetAnchorContext);
    const visible = usePremiumSearchVisible();
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setAnchor(ref.current);
        return () => setAnchor(null);
    }, [setAnchor]);
    return (
        <div
            ref={ref}
            style={{
                position: inline ? "relative" : "absolute",
                right: inline ? undefined : "calc(100% + 12px)",
                bottom: inline ? undefined : 0,
                width: inline ? "min(8.25rem, 100%)" : "7.875rem",
                height: "max(36px, 2.25rem)",
                containerType: "inline-size",
                display: inline && !visible ? "none" : "flex",
                flexShrink: 0,
                alignSelf: inline ? "flex-start" : undefined,
                alignItems: "flex-end",
                pointerEvents: "auto",
                zIndex: 2,
            }}
        />
    );
};

export const PremiumSearchDockSlot: React.FC<{ compact?: boolean; inline?: boolean }> = ({
    compact = false,
    inline = false,
}) => {
    const setAnchor = useContext(SetDockAnchorContext);
    const visible = useContext(DockVisibleContext);
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        setAnchor(ref.current);
        return () => setAnchor(null);
    }, [setAnchor]);
    return (
        <Box
            ref={ref}
            sx={{
                position: inline ? "relative" : "absolute",
                right: inline ? undefined : "calc(100% + 10px)",
                top: inline ? undefined : "50%",
                transform: inline ? undefined : "translateY(-50%)",
                width: compact ? "8.25rem" : 168,
                height: compact ? "max(36px, 2.25rem)" : PREMIUM_SEARCH_HEIGHT_PX,
                containerType: "inline-size",
                display: visible ? "flex" : "none",
                alignItems: "center",
                pointerEvents: "auto",
                zIndex: 1400,
            }}
        />
    );
};

export { PremiumGuide as PremiumSearch } from "./PremiumGuide";
