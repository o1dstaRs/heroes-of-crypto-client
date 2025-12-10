import Box, { BoxProps } from "@mui/material/Box";
import Link from "@mui/material/Link";
import { m } from "framer-motion";
import React, { forwardRef } from "react";
import RouterLink from "../routes/router_link";

const logoHoCImg = new URL("../../../images/logo_hoc.webp", import.meta.url).toString();

// ----------------------------------------------------------------------

export interface LogoProps extends BoxProps {
    disabledLink?: boolean;
}

const Logo = forwardRef<HTMLDivElement, LogoProps>(function Logo({ disabledLink = false, sx, ...other }, ref) {
    const logo = (
        <Box
            ref={ref}
            component={m.img}
            src={(logoHoCImg as unknown as { default?: string }).default ?? logoHoCImg}
            sx={{
                width: 40,
                height: 40,
                display: "inline-flex",
                ...sx,
            }}
            {...other}
        />
    );

    if (disabledLink) {
        return logo;
    }

    return (
        <Link component={RouterLink} href="/" sx={{ display: "contents" }}>
            {logo}
        </Link>
    );
});

export default Logo;
