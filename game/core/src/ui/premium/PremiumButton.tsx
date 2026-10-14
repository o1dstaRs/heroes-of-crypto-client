import { Button, type ButtonProps } from "@mui/joy";
import React, { forwardRef } from "react";

import { PremiumIcon } from "../PremiumIcon";

export const PremiumButton = forwardRef<HTMLButtonElement, ButtonProps>(function PremiumButton(
    { startDecorator = <PremiumIcon size={16} />, ...props },
    ref,
) {
    return <Button {...props} ref={ref} startDecorator={startDecorator} />;
});
