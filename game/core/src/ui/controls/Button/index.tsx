import React, { MouseEventHandler } from "react";

import "./style.scss";

interface ButtonProps {
    label: string;
    onClick: MouseEventHandler<HTMLButtonElement>;
    className?: string;
}

export const Button = ({ label, onClick, className = "button" }: ButtonProps) => (
    <button className={className} onClick={onClick}>
        {label}
    </button>
);
