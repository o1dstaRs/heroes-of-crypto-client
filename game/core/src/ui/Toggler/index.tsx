import React from "react";
import Box from "@mui/joy/Box";

export default function Toggler({
    defaultExpanded = true,
    renderToggle,
    children,
}: {
    defaultExpanded?: boolean;
    children: React.ReactNode;
    renderToggle: (params: {
        open: boolean;
        setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    }) => React.ReactNode;
}) {
    const [open, setOpen] = React.useState(defaultExpanded);
    return (
        <>
            {renderToggle({ open, setOpen })}
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
