import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React from "react";

interface ICalendarInfoProps {
    day: number;
    week: number;
    daysUntilNextFight: number;
}

const CalendarInfo: React.FC<ICalendarInfoProps> = ({ day, week, daysUntilNextFight }) => (
    <>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", paddingTop: 2 }}>
            <CalendarTodayRoundedIcon />
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm" sx={{ fontSize: 13 }}>
                    Day {day}
                </Typography>
                <Typography level="body-xs">Week {week}</Typography>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm" sx={{ fontSize: 13 }}>
                    Next fight in
                </Typography>
                <Typography level="body-xs">{daysUntilNextFight} days</Typography>
            </Box>
        </Box>
    </>
);

export default CalendarInfo;
