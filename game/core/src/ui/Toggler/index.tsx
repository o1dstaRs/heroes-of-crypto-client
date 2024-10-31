import React from "react";
import Box from "@mui/joy/Box";

export default function Toggler({
    defaultExpanded = true,
    expanded,
    renderToggle,
    children,
}: {
    defaultExpanded?: boolean;
    expanded?: boolean;
    children: React.ReactNode;
    renderToggle: (params: {
        open: boolean;
        setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    }) => React.ReactNode;
}) {
    const [localOpen, setLocalOpen] = React.useState(defaultExpanded);
    const open = expanded !== undefined ? expanded : localOpen;

    return (
        <>
            {renderToggle({
                open,
                setOpen: expanded !== undefined ? setLocalOpen : setLocalOpen,
            })}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateRows: open ? "1fr" : "0fr",
                    transition: "0.2s ease",
                    "& > *": {
                        overflow: "hidden",
                    },
                }}
            >
                {children}
            </Box>
        </>
    );
}
