import Typography from "@mui/joy/Typography";
import React from "react";

import { formatRulesDate, type IExitRulesInfo } from "./exitRulesModel";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";

/**
 * During the announcement week the screens explain the new rules while scoring stays on the old ones; this line says
 * so, with the start date once one is set. Renders nothing outside ranked or once the rules apply.
 */
export const ExitRulesPreviewNote: React.FC<{ rules: IExitRulesInfo; compact?: boolean }> = ({
    rules,
    compact = false,
}) => {
    const { language } = useTranslation();
    if (!rules.ranked || rules.enforced) {
        return null;
    }
    const date = rules.enforceAtMs > 0 ? formatRulesDate(rules.enforceAtMs, language) : "";
    const text = compact
        ? date
            ? tf("Rules apply from {date}", { date })
            : t("Rules start soon")
        : date
          ? tf("These rules apply from {date}. Until then, leaving counts as it does today.", { date })
          : t("These rules start soon. Until then, leaving counts as it does today.");
    return (
        <Typography level="body-xs" textColor={hocColors.gold}>
            {text}
        </Typography>
    );
};
