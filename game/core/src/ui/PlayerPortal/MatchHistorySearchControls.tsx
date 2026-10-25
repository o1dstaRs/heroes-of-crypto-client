import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
    Autocomplete,
    AutocompleteOption,
    Box,
    Button,
    CircularProgress,
    Option,
    Select,
    Stack,
    ToggleButtonGroup,
    Typography,
} from "@mui/joy";
import React from "react";

import type { MatchHistoryScope } from "../../api/player_portal_client";
import { images } from "../../generated/image_imports";
import { t, tf } from "../../i18n/i18n";
import { hocColors } from "../hocTheme";
import type { MatchHistoryFilter } from "./matchHistoryModel";
import { matchHistorySuggestions, normalizeHistorySearch } from "./matchHistorySearch";
import { CreatureIcon } from "./portalFormat";

interface MatchHistorySearchControlsProps {
    query: string;
    scope: MatchHistoryScope;
    filter: MatchHistoryFilter;
    count: number;
    loading: boolean;
    onQueryChange: (query: string) => void;
    onScopeChange: (scope: MatchHistoryScope) => void;
    onFilterChange: (filter: MatchHistoryFilter) => void;
}

const controlSx = {
    minWidth: 0,
    minHeight: 42,
    color: hocColors.parchment,
    bgcolor: "rgba(239,228,204,0.025)",
    borderColor: "rgba(220,177,88,0.25)",
    borderRadius: "8px",
    "--Input-focusedHighlight": hocColors.gold,
    "--Autocomplete-focusedHighlight": hocColors.gold,
    "--Select-focusedHighlight": hocColors.gold,
    "&:not([data-inverted-colors='false'])": {
        "--Input-focusedHighlight": hocColors.gold,
        "--Select-focusedHighlight": hocColors.gold,
    },
    "&:hover": { borderColor: "rgba(220,177,88,0.5)", bgcolor: "rgba(239,228,204,0.045)" },
} as const;

const optionSx = {
    "&&": {
        color: hocColors.parchment,
        bgcolor: "transparent",
        "&:hover, &.Mui-focused, &.Mui-focusVisible, &.Mui-highlighted, &[aria-selected='true']": {
            color: hocColors.parchment,
            bgcolor: "rgba(220,177,88,0.13)",
        },
    },
} as const;

export const MatchHistorySearchControls: React.FC<MatchHistorySearchControlsProps> = ({
    query,
    scope,
    filter,
    count,
    loading,
    onQueryChange,
    onScopeChange,
    onFilterChange,
}) => (
    <Stack spacing={1.25} sx={{ mb: 1.25, minWidth: 0 }}>
        <Box
            sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) 170px" }, gap: 1 }}
        >
            <Autocomplete
                freeSolo
                autoHighlight
                value={null}
                inputValue={query}
                options={matchHistorySuggestions}
                groupBy={(option) => (option.kind === "artifact" ? t("Artifacts") : t("Creatures"))}
                getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
                filterOptions={(options, state) => {
                    const words = normalizeHistorySearch(state.inputValue).split(/\s+/).filter(Boolean);
                    return options.filter((option) =>
                        words.every((word) => normalizeHistorySearch(option.label).includes(word)),
                    );
                }}
                onInputChange={(_, value, reason) => {
                    if (reason !== "reset") onQueryChange(value);
                }}
                onChange={(_, value) => onQueryChange(typeof value === "string" ? value : (value?.label ?? ""))}
                placeholder={t("Search artifacts, creatures or opponents…")}
                clearText={t("Clear history search")}
                startDecorator={<SearchRoundedIcon sx={{ color: hocColors.gold, fontSize: 21 }} />}
                endDecorator={
                    loading ? (
                        <CircularProgress
                            size="sm"
                            aria-label={t("Searching match history")}
                            sx={{ "--CircularProgress-size": "18px", color: hocColors.gold }}
                        />
                    ) : undefined
                }
                slotProps={{
                    input: { "aria-label": t("Search match history"), maxLength: 160 },
                    listbox: {
                        sx: {
                            maxHeight: 320,
                            bgcolor: "#17130f",
                            color: hocColors.parchment,
                            borderColor: "rgba(220,177,88,0.3)",
                        },
                    },
                }}
                renderGroup={({
                    key,
                    group,
                    children,
                }: {
                    key: React.Key;
                    group: string;
                    children?: React.ReactNode;
                }) => (
                    <Box component="li" role="presentation" key={key} sx={{ listStyle: "none" }}>
                        <Typography
                            component="div"
                            level="body-xs"
                            sx={{
                                px: 1.5,
                                py: 0.75,
                                color: hocColors.gold,
                                bgcolor: "#17130f",
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                            }}
                        >
                            {group}
                        </Typography>
                        <Box component="ul" role="group" aria-label={group} sx={{ m: 0, p: 0, listStyle: "none" }}>
                            {children}
                        </Box>
                    </Box>
                )}
                renderOption={(props, option) => {
                    const { key, ...rest } = props as typeof props & { key?: React.Key };
                    const artwork = option.imageKey ? images[option.imageKey as keyof typeof images] : undefined;
                    return (
                        <AutocompleteOption
                            key={key ?? `${option.kind}:${option.label}`}
                            {...rest}
                            sx={{
                                ...optionSx,
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                minHeight: 42,
                                color: hocColors.parchment,
                                bgcolor: "transparent",
                                "&:hover, &.Mui-focused, &.Mui-focusVisible, &[aria-selected='true']": {
                                    color: hocColors.parchment,
                                    bgcolor: "rgba(220,177,88,0.13)",
                                },
                            }}
                        >
                            <Box sx={{ width: 28, height: 28, flexShrink: 0, display: "grid", placeItems: "center" }}>
                                {option.creatureId ? (
                                    <CreatureIcon creatureId={option.creatureId} size={26} />
                                ) : artwork ? (
                                    <Box
                                        component="img"
                                        src={artwork}
                                        alt=""
                                        sx={{ width: 26, height: 26, objectFit: "contain" }}
                                    />
                                ) : (
                                    <AutoAwesomeRoundedIcon sx={{ color: hocColors.gold, fontSize: 20 }} />
                                )}
                            </Box>
                            <Typography level="body-sm" sx={{ color: hocColors.parchment, flex: 1, minWidth: 0 }}>
                                {option.label}
                            </Typography>
                        </AutocompleteOption>
                    );
                }}
                sx={controlSx}
            />
            <Select<MatchHistoryScope>
                aria-label={t("Search army")}
                value={scope}
                placeholder={t(
                    scope === "either" ? "Either army" : scope === "player" ? "Your army" : "Opponent's army",
                )}
                renderValue={() =>
                    t(scope === "either" ? "Either army" : scope === "player" ? "Your army" : "Opponent's army")
                }
                onChange={(_, value) => {
                    if (value) onScopeChange(value);
                }}
                sx={controlSx}
                slotProps={{
                    listbox: {
                        sx: { bgcolor: "#17130f", color: hocColors.parchment, borderColor: "rgba(220,177,88,0.3)" },
                    },
                }}
            >
                <Option value="either" sx={optionSx}>
                    {t("Either army")}
                </Option>
                <Option value="player" sx={optionSx}>
                    {t("Your army")}
                </Option>
                <Option value="opponent" sx={optionSx}>
                    {t("Opponent's army")}
                </Option>
            </Select>
        </Box>
        <Stack direction="row" spacing={0.7} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
            <Typography level="body-xs" textColor={hocColors.muted}>
                {t("Try:")}
            </Typography>
            {["Dual Strike Charm", "Berserker", "Wolf"].map((example) => (
                <Button
                    key={example}
                    size="sm"
                    variant="plain"
                    onClick={() => onQueryChange(example)}
                    sx={{
                        minHeight: 24,
                        py: 0.25,
                        px: 0.8,
                        borderRadius: "5px",
                        color: hocColors.mutedStrong,
                        fontSize: "0.7rem",
                        bgcolor: "rgba(239,228,204,0.04)",
                        "&:hover": { color: hocColors.gold, bgcolor: "rgba(220,177,88,0.1)" },
                    }}
                >
                    {example}
                </Button>
            ))}
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ fontSize: "0.69rem" }}>
                {t("Combine names to narrow your search.")}
            </Typography>
        </Stack>
        <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            spacing={1}
            sx={{ minHeight: 34, flexWrap: "wrap", rowGap: 0.75 }}
        >
            <ToggleButtonGroup
                aria-label={t("Filter match history")}
                size="sm"
                value={filter}
                onChange={(_, value) => {
                    if (value) onFilterChange(value as MatchHistoryFilter);
                }}
                sx={{
                    borderRadius: "7px",
                    "& button": {
                        minWidth: 0,
                        px: 1.25,
                        minHeight: 32,
                        color: hocColors.mutedStrong,
                        borderColor: hocColors.orangeBorder,
                        borderRadius: "7px",
                        "&[aria-pressed='true']": { bgcolor: hocColors.orangeSoft, color: hocColors.parchment },
                    },
                }}
            >
                <Button value="all">{t("All")}</Button>
                <Button value="wins">{t("Wins")}</Button>
                <Button value="losses">{t("Losses")}</Button>
            </ToggleButtonGroup>
            <Typography role="status" aria-live="polite" level="body-xs" textColor={hocColors.muted}>
                {loading ? t("Searching match history…") : tf("{count} matches shown", { count })}
            </Typography>
        </Stack>
    </Stack>
);
