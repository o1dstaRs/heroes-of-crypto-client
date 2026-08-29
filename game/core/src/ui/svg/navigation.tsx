import { createSvgIcon } from "@mui/material/utils";
import React from "react";

const iconStroke = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.5,
};

export const RankedNavIcon = createSvgIcon(
    <>
        <path
            d="M7.15 7.3h9.7c2.03 0 3.78 1.45 4.15 3.45l1.02 5.42c.28 1.48-.86 2.83-2.37 2.83-.75 0-1.46-.35-1.91-.95l-1.18-1.57H7.44l-1.18 1.57c-.45.6-1.16.95-1.91.95-1.51 0-2.65-1.35-2.37-2.83L3 10.75A4.22 4.22 0 0 1 7.15 7.3Z"
            fill="currentColor"
            opacity="0.18"
        />
        <path
            d="M7.15 7.3h9.7c2.03 0 3.78 1.45 4.15 3.45l1.02 5.42c.28 1.48-.86 2.83-2.37 2.83-.75 0-1.46-.35-1.91-.95l-1.18-1.57H7.44l-1.18 1.57c-.45.6-1.16.95-1.91.95-1.51 0-2.65-1.35-2.37-2.83L3 10.75A4.22 4.22 0 0 1 7.15 7.3Z"
            {...iconStroke}
        />
        <path d="M7.75 10.15v4.3M5.6 12.3h4.3M12 7.3V5.1h2.45" {...iconStroke} />
        <circle cx="16.05" cy="11.05" r="1" fill="currentColor" />
        <circle cx="18.35" cy="13.35" r="1" fill="currentColor" />
    </>,
    "RankedNav",
);

export const LobbyNavIcon = createSvgIcon(
    <>
        <path d="M5 20.5V10.25a7 7 0 0 1 14 0V20.5H5Z" fill="currentColor" opacity="0.12" />
        <path d="M5 20.5V10.25a7 7 0 0 1 14 0V20.5M3.5 20.5h17" {...iconStroke} />
        <path d="M8 20.5V10.7a4 4 0 0 1 8 0v9.8H8Z" fill="currentColor" opacity="0.24" />
        <path d="M8 20.5V10.7a4 4 0 0 1 8 0v9.8M12 6.7v13.8" {...iconStroke} />
        <circle cx="13.75" cy="14.2" r="0.85" fill="currentColor" />
    </>,
    "LobbyNav",
);

export const SandboxNavIcon = createSvgIcon(
    <>
        <path
            d="M4 4h16v16H4V4Zm0 0h4v4H4V4Zm8 0h4v4h-4V4Zm4 4h4v4h-4V8Zm-8 0h4v4H8V8Zm-4 4h4v4H4v-4Zm8 0h4v4h-4v-4Zm4 4h4v4h-4v-4Zm-8 0h4v4H8v-4Z"
            fill="currentColor"
            fillRule="evenodd"
            opacity="0.25"
        />
        <path d="M4 4h16v16H4V4ZM8 4v16M12 4v16M16 4v16M4 8h16M4 12h16M4 16h16" {...iconStroke} />
        <path d="M2.75 20.5h18.5" {...iconStroke} />
    </>,
    "SandboxNav",
);

export const ProfileNavIcon = createSvgIcon(
    <>
        <path d="M6.2 20.25c.78-3.42 2.75-5.25 5.8-5.25s5.02 1.83 5.8 5.25H6.2Z" fill="currentColor" opacity="0.2" />
        <path
            d="M8 8.35V7.2a4 4 0 0 1 8 0v1.15c0 3.05-1.62 5.15-4 5.15s-4-2.1-4-5.15ZM6.2 20.25c.78-3.42 2.75-5.25 5.8-5.25s5.02 1.83 5.8 5.25"
            {...iconStroke}
        />
        <path d="M7.25 8.35h9.5M9 4.6 12 2.75l3 1.85" {...iconStroke} />
        <path d="M9.75 10.35h.01M14.25 10.35h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </>,
    "ProfileNav",
);

export const StatsPanelIcon = createSvgIcon(
    <>
        <path d="M14.25 4h5.25a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5.25V4Z" fill="currentColor" opacity="0.2" />
        <path
            d="M4.5 4h15a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14.25 4v16"
            {...iconStroke}
        />
        <path d="M6.5 8h4.75M6.5 11h3.25M16.4 16v-3M18.35 16V8" {...iconStroke} />
    </>,
    "StatsPanel",
);

export const RankedSearchIcon = createSvgIcon(
    <>
        <path
            d="M10.5 2.75 16.5 5v4.15c0 4.15-2.1 7.45-6 9.65-3.9-2.2-6-5.5-6-9.65V5l6-2.25Z"
            fill="currentColor"
            opacity="0.18"
        />
        <path
            d="M10.5 2.75 16.5 5v4.15c0 .65-.05 1.25-.15 1.82M11.15 18.42l-.65.38c-3.9-2.2-6-5.5-6-9.65V5l6-2.25"
            {...iconStroke}
        />
        <path d="m7.5 8.4 3-1.45 3 1.45M8.4 11.05h3" {...iconStroke} />
        <circle cx="15.35" cy="14.65" r="4" fill="currentColor" opacity="0.12" />
        <circle cx="15.35" cy="14.65" r="4" {...iconStroke} />
        <path d="m18.2 17.5 2.8 2.8" {...iconStroke} />
    </>,
    "RankedSearch",
);

export const PracticeAiIcon = createSvgIcon(
    <>
        <path d="m7 7 2.3-2 2.7 2 2.7-2L17 7l2 2v8l-2 2H7l-2-2V9l2-2Z" fill="currentColor" opacity="0.18" />
        <path d="m7 7 2.3-2 2.7 2 2.7-2L17 7l2 2v8l-2 2H7l-2-2V9l2-2ZM12 5V2.8" {...iconStroke} />
        <circle cx="12" cy="2.8" r="1" fill="currentColor" />
        <path d="M8.25 10.5h7.5v4h-7.5v-4ZM9 17h6" {...iconStroke} />
        <circle cx="10.25" cy="12.5" r="0.9" fill="currentColor" />
        <circle cx="13.75" cy="12.5" r="0.9" fill="currentColor" />
    </>,
    "PracticeAi",
);

export const LanguageNavIcon = createSvgIcon(
    <>
        <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity="0.12" />
        <circle cx="12" cy="12" r="8.5" {...iconStroke} />
        <path
            d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2 2.25 3 5.08 3 8.5s-1 6.25-3 8.5M12 3.5c-2 2.25-3 5.08-3 8.5s1 6.25 3 8.5"
            {...iconStroke}
        />
    </>,
    "LanguageNav",
);

export const RefreshNavIcon = createSvgIcon(
    <>
        <path
            d="M18.7 8.2A7.6 7.6 0 0 0 5.15 7.05L3.5 9.3M5.3 15.8a7.6 7.6 0 0 0 13.55 1.15l1.65-2.25"
            {...iconStroke}
        />
        <path d="M3.5 4.9v4.4h4.4M20.5 19.1v-4.4h-4.4" fill="currentColor" opacity="0.22" />
        <path d="M3.5 4.9v4.4h4.4M20.5 19.1v-4.4h-4.4" {...iconStroke} />
        <path
            d="m12 7.7 1.28 2.6 2.87.42-2.08 2.02.49 2.86L12 14.25 9.44 15.6l.49-2.86-2.08-2.02 2.87-.42L12 7.7Z"
            fill="currentColor"
            opacity="0.28"
        />
    </>,
    "RefreshNav",
);

export const SettingsNavIcon = createSvgIcon(
    <>
        <path
            d="M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM19.4 12c0-.45-.04-.89-.12-1.31l1.86-1.4-1.9-3.29-2.19.85a7.3 7.3 0 0 0-2.27-1.31L14.4 3.2h-3.8l-.38 2.34a7.3 7.3 0 0 0-2.27 1.31l-2.19-.85-1.9 3.29 1.86 1.4a7.6 7.6 0 0 0 0 2.62l-1.86 1.4 1.9 3.29 2.19-.85a7.3 7.3 0 0 0 2.27 1.31l.38 2.34h3.8l.38-2.34a7.3 7.3 0 0 0 2.27-1.31l2.19.85 1.9-3.29-1.86-1.4c.08-.42.12-.86.12-1.31Z"
            {...iconStroke}
        />
    </>,
    "SettingsNav",
);
