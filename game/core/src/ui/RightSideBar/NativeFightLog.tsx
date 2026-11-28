import Box from "@mui/joy/Box";
import React from "react";
import { createRoot } from "react-dom/client";

import { DEFAULT_LANGUAGE, setLanguage, t } from "../../i18n/i18n";
import { hocSidebarSectionSx } from "../hocTheme";
import { FightLog } from "./FightLog";
import { FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX, FIGHT_LOG_SURFACE_BACKGROUND } from "./fightLogLayout";
import { fightLogPaintKey } from "./fightLogTeamNames";

declare global {
    interface Window {
        webkit?: { messageHandlers?: { copyBattleLog?: { postMessage: (text: string) => Promise<void> } } };
    }
}

const container = document.getElementById("fight-log")!;
const root = createRoot(container);
const clipboard = window.webkit?.messageHandlers?.copyBattleLog;
const copyText = clipboard ? (text: string) => clipboard.postMessage(text) : undefined;

function render(text: string, language = DEFAULT_LANGUAGE): void {
    setLanguage(language, { persist: false });
    document.title = t("Fight log");
    container.setAttribute("aria-label", document.title);
    root.render(
        <Box
            sx={{
                ...hocSidebarSectionSx("team"),
                width: `calc(100% - ${FIGHT_LOG_SCROLLBAR_LANE_WIDTH_PX - 10}px)`,
                height: "100%",
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "visible",
                background: FIGHT_LOG_SURFACE_BACKGROUND,
                backgroundOrigin: "border-box",
                backgroundClip: "border-box",
                boxShadow: "0 7px 16px rgba(0,0,0,.72)",
            }}
        >
            <FightLog text={text} paintKey={fightLogPaintKey()} copyText={copyText} />
        </Box>,
    );
}
Object.assign(window, { hocSetBattleLog: render });
render("");
