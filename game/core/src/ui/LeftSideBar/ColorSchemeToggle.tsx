import * as React from "react";
import { useColorScheme } from "@mui/joy/styles";
import IconButton, { IconButtonProps } from "@mui/joy/IconButton";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeIcon from "@mui/icons-material/LightMode";

interface ColorSchemeToggleProps extends IconButtonProps {
    defaultMode?: "light" | "dark"; // Add defaultMode prop
}

export default function ColorSchemeToggle({ onClick, sx, defaultMode = "dark", ...props }: ColorSchemeToggleProps) {
    const { mode, setMode } = useColorScheme();
    const [mounted, setMounted] = React.useState(false);

    // Sync mode with defaultMode on first mount
    React.useEffect(() => {
        setMounted(true);

        // Only set the mode if it hasn't been set yet
        if (!mode && mounted) {
            setMode(defaultMode); // Use defaultMode for the initial load
        }
    }, [mode, setMode, defaultMode, mounted]);

    if (!mounted) {
        return <IconButton size="sm" variant="outlined" color="neutral" {...props} sx={sx} disabled />;
    }

    return (
        <IconButton
            id="toggle-mode"
            size="sm"
            variant="outlined"
            color="neutral"
            {...props}
            onClick={(event) => {
                if (mode === "light") {
                    setMode("dark");
                } else {
                    setMode("light");
                }
                onClick?.(event);
            }}
            sx={[
                {
                    "& > *:first-of-type": {
                        display: mode === "dark" ? "none" : "initial",
                    },
                    "& > *:last-child": {
                        display: mode === "light" ? "none" : "initial",
                    },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            <DarkModeRoundedIcon />
            <LightModeIcon />
        </IconButton>
    );
}
