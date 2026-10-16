import { axiosMMInstance, endpoints } from "./axios";

/** Player reports (integrity phase 4): the opponent, once per ranked match, from the results screen. */

export const REPORT_CATEGORIES = ["away_or_ai", "win_trading", "cheating", "abusive", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_NOTE_MAX_CHARS = 500;

export const submitPlayerReport = async (input: {
    gameId: string;
    category: ReportCategory;
    note: string;
}): Promise<void> => {
    await axiosMMInstance.post(
        endpoints.mm.rankedReport,
        JSON.stringify({
            gameId: input.gameId,
            category: input.category,
            note: input.note.trim().slice(0, REPORT_NOTE_MAX_CHARS),
        }),
        { headers: { "Content-Type": "application/json" }, responseType: "json" },
    );
};
