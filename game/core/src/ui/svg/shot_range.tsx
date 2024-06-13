import { createSvgIcon } from "@mui/material/utils";
import React from "react";

export const ShotRangeIcon = createSvgIcon(
    <svg width="800px" height="800px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
            fill="#AB7C94"
            d="M7 13v1l-2-1.5L7 11v1h11v-1l2 1.5-2 1.5v-1zm-6-2h3v3H1zm1 2h1v-1H2zM16.893.5l-.671.742a14.5 14.5 0 0 1 .136 21.392l.68.732A15.5 15.5 0 0 0 16.893.5z"
        />
        <path fill="none" d="M0 0h24v24H0z" />
    </svg>,
    "ShotRange",
);
