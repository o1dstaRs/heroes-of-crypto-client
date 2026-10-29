import SvgIcon from "@mui/joy/SvgIcon";
import React, { createContext, useId } from "react";

export type PremiumThumbStyle = "classic" | "relief" | "gauntlet" | "seal" | "crest" | "rune";
export type PremiumThumbMedal = "gold" | "silver";
export const PremiumThumbStyleContext = createContext<PremiumThumbStyle>("classic");

const HAND =
    "M18 29C23 25 28 18 29 10C29 6 32 4 35 7C39 11 36 18 35 22H48C53 22 55 25 54 30L49 48C48 52 45 54 40 54H25L18 50Z";

export const PremiumThumbIcon: React.FC<{
    medal: PremiumThumbMedal;
    variant?: PremiumThumbStyle;
    size?: number;
}> = ({ medal, variant = "classic", size = 25 }) => {
    const id = useId();
    const metal = `${id}-metal`;
    const rim = `${id}-rim`;
    const palette =
        medal === "gold"
            ? { light: "#fff0bd", face: "#d3a24c", mid: "#a5752c", dark: "#533012", edge: "#2a190c" }
            : { light: "#f6f1dc", face: "#b9c0c1", mid: "#7c8993", dark: "#3d4851", edge: "#1c232b" };
    const classicTones = medal === "gold" ? ["#fff3b0", "#d7a637", "#805319"] : ["#f3f5f5", "#b4bec9", "#626f7d"];
    const fill = `url(#${metal})`;
    return (
        <SvgIcon
            viewBox="0 0 64 64"
            aria-hidden="true"
            data-thumb-style={variant}
            data-thumb-direction="mirrored"
            sx={{ fontSize: size, overflow: "visible" }}
        >
            <defs>
                <linearGradient id={metal} x1="0" y1="0" x2={variant === "classic" ? "0.8" : "0.85"} y2="1">
                    {variant === "classic" ? (
                        <>
                            <stop offset="0%" stopColor={classicTones[0]} />
                            <stop offset="48%" stopColor={classicTones[1]} />
                            <stop offset="100%" stopColor={classicTones[2]} />
                        </>
                    ) : (
                        <>
                            <stop offset="0" stopColor={palette.light} />
                            <stop offset=".28" stopColor={palette.face} />
                            <stop offset=".49" stopColor={palette.light} />
                            <stop offset=".53" stopColor={palette.face} />
                            <stop offset="1" stopColor={palette.dark} />
                        </>
                    )}
                </linearGradient>
                <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={palette.light} />
                    <stop offset=".3" stopColor={palette.mid} />
                    <stop offset=".7" stopColor={palette.dark} />
                    <stop offset="1" stopColor={palette.face} />
                </linearGradient>
            </defs>
            <g transform="translate(64 0) scale(-1 1)" strokeLinejoin="round">
                {variant === "classic" && (
                    <g transform="scale(2.6666667)" fill={fill} stroke={classicTones[2]} strokeWidth=".65">
                        <path d="M1 21h4V9H1v12zm21-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.59 7.59C6.22 7.95 6 8.45 6 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                    </g>
                )}
                {variant === "relief" && (
                    <g stroke={palette.edge} strokeWidth="2">
                        <path d={HAND} fill={fill} />
                        <path d="M8 28H18V55H8Z" fill={`url(#${rim})`} />
                        <path
                            d="M21 29L29 19L32 9M23 51H39M11 31V51"
                            fill="none"
                            stroke={palette.light}
                            strokeWidth="1.4"
                            opacity=".8"
                        />
                        <path
                            d="M39 30H51M38 38H49M36 46H46M21 34L26 36V46"
                            fill="none"
                            stroke={palette.dark}
                            strokeWidth="1.5"
                        />
                        <circle cx="13" cy="48" r="1.6" fill={palette.light} stroke="none" />
                    </g>
                )}
                {variant === "gauntlet" && (
                    <g stroke={palette.edge} strokeWidth="2">
                        <path d="M20 29L27 20L29 8L34 5L39 9L37 21L52 23L56 29L50 49L44 54H25L19 49Z" fill={fill} />
                        <path d="M5 27L19 25L22 55L7 58Z" fill={`url(#${rim})`} />
                        <path d="M24 30L31 23L39 25L43 32L36 47L25 48Z" fill={palette.mid} />
                        <path
                            d="M25 31L32 26L39 28M28 17L37 20M30 10L38 13M41 30L53 32M40 37L51 39M38 44L49 46"
                            fill="none"
                            stroke={palette.light}
                            strokeWidth="1.4"
                        />
                        <path d="M29 32L35 36L32 43M10 31L12 52" fill="none" stroke={palette.dark} strokeWidth="2" />
                        <circle cx="12" cy="34" r="2" fill={palette.light} />
                        <circle cx="14" cy="49" r="2" fill={palette.light} />
                    </g>
                )}
                {variant === "seal" && (
                    <g>
                        <circle cx="32" cy="32" r="29" fill="#17130f" stroke={palette.edge} strokeWidth="2" />
                        <circle cx="32" cy="32" r="27" fill="none" stroke={`url(#${rim})`} strokeWidth="4" />
                        <circle cx="32" cy="32" r="22" fill="#282119" stroke={palette.mid} strokeWidth="1" />
                        <g transform="translate(10 7) scale(.72)" stroke={palette.dark} strokeWidth="1.5">
                            <path d={HAND} fill={fill} />
                            <path d="M7 28H17V54H7Z" fill={fill} />
                            <path d="M38 31H50M37 39H48M35 47H44" fill="none" />
                        </g>
                        {[0, 90, 180, 270].map((angle) => (
                            <path
                                key={angle}
                                d="M32 5L34 8L32 11L30 8Z"
                                transform={`rotate(${angle} 32 32)`}
                                fill={palette.light}
                            />
                        ))}
                    </g>
                )}
                {variant === "crest" && (
                    <g>
                        <path
                            d="M9 8L22 6L32 3L42 6L55 8L53 37Q49 52 32 61Q15 52 11 37Z"
                            fill={`url(#${rim})`}
                            stroke={palette.edge}
                            strokeWidth="2"
                        />
                        <path
                            d="M14 12L32 8L50 12L48 36Q44 47 32 55Q20 47 16 36Z"
                            fill="#25201a"
                            stroke={palette.dark}
                            strokeWidth="1.5"
                        />
                        <g transform="translate(13 7) scale(.63)" stroke={palette.dark} strokeWidth="1.6">
                            <path d={HAND} fill={fill} />
                            <path d="M7 28H17V54H7Z" fill={fill} />
                        </g>
                        <path
                            d="M20 44L27 48M44 44L37 48M30 51L32 54L34 51"
                            fill="none"
                            stroke={palette.face}
                            strokeWidth="1.5"
                        />
                    </g>
                )}
                {variant === "rune" && (
                    <g stroke={palette.edge} strokeWidth="2">
                        <path
                            d="M20 29L29 18L30 7L35 4L39 9L36 23H52L56 28L49 51L42 55H25L19 49Z"
                            fill={palette.dark}
                        />
                        <path
                            d="M21 29L31 19L33 8L36 10L33 26H50L52 29L46 49L41 52H26L22 48Z"
                            fill={fill}
                            stroke={palette.light}
                            strokeWidth="1"
                        />
                        <path d="M6 28L17 26L20 56L7 58Z" fill={palette.dark} stroke={palette.face} strokeWidth="1.5" />
                        <path
                            d="M31 34L39 39L31 46Z M31 31V49M10 33L14 39L10 46"
                            fill="none"
                            stroke={palette.edge}
                            strokeWidth="2"
                        />
                        <path d="M32 34L38 39L32 44" fill="none" stroke={palette.light} strokeWidth="1" />
                    </g>
                )}
            </g>
        </SvgIcon>
    );
};
