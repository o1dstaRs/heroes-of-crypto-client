import React from "react";
import Box from "@mui/joy/Box";

export const shouldRenderTogglerChildren = (
    deferChildrenUntilExpanded: boolean,
    open: boolean,
    hasExpanded: boolean,
): boolean => !deferChildrenUntilExpanded || open || hasExpanded;

export default function Toggler({
    defaultExpanded = true,
    expanded,
    deferChildrenUntilExpanded = false,
    renderToggle,
    children,
}: {
    defaultExpanded?: boolean;
    expanded?: boolean;
    /** Avoid mounting expensive hidden panels until the player opens them for the first time. */
    deferChildrenUntilExpanded?: boolean;
    children: React.ReactNode;
    renderToggle: (params: {
        open: boolean;
        setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    }) => React.ReactNode;
}) {
    const [localOpen, setLocalOpen] = React.useState(defaultExpanded);
    const open = expanded !== undefined ? expanded : localOpen;
    const [hasExpanded, setHasExpanded] = React.useState(open);

    React.useEffect(() => {
        if (open) setHasExpanded(true);
    }, [open]);

    const renderChildren = shouldRenderTogglerChildren(deferChildrenUntilExpanded, open, hasExpanded);

    return (
        <>
            {renderToggle({
                open,
                setOpen: expanded !== undefined ? setLocalOpen : setLocalOpen,
            })}
            <Box
                data-hoc-toggler-body="true"
                data-open={open ? "true" : "false"}
                sx={{
                    display: "grid",
                    gridTemplateRows: open ? "1fr" : "0fr",
                    transition: "0.2s ease",
                    "& > *": {
                        overflow: "hidden",
                    },
                }}
            >
                {renderChildren ? children : null}
            </Box>
        </>
    );
}
