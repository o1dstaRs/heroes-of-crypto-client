import React from "react";
import { Box, Sheet } from "@mui/joy";

import overlayPickImage from "../../../images/overlay_pick.webp";

interface StainedGlassProps {
    width?: string | number;
    height?: string | number;
}

const StainedGlassWindow: React.FC<StainedGlassProps> = ({ height = window.innerHeight }) => {
    const width = (height as number) * 0.84; // Reduce width by 10%
    return (
        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <Box
                sx={{
                    width,
                    height,
                    position: "relative",
                    background: "transparent",
                    paddingLeft: "1.5%",
                    paddingRight: "1.5%",
                    paddingTop: "3.5%",
                    paddingBottom: "2%",
                    borderRadius: "16px",
                }}
            >
                <Sheet
                    sx={{
                        width: "100%",
                        height: "95%", // Cut 5% of the background image on the bottom
                        borderRadius: "50% 50% 0 0",
                        overflow: "hidden",
                        position: "relative",
                        display: "flex",
                        paddingRight: "2.6%",
                        paddingLeft: "2.6%",
                        paddingBottom: "1.2%",
                        backgroundImage: `url(${overlayPickImage})`,
                        backgroundSize: "100% 107%", // Adjust the background size accordingly
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        boxShadow: "0 0 50px 25px rgba(255, 223, 186, 0.3)", // Diffused for a softer light effect
                        animation: "gentlePulse 15s infinite alternate", // Changed animation for a gentler effect
                    }}
                >
                    <style>
                        {`
                                        @keyframes gentlePulse {
                                            from {
                                                box-shadow: 0 0 50px 25px rgba(255, 165, 0, 0.3);
                                            }
                                            to {
                                                box-shadow: 0 0 80px 40px rgba(255, 140, 0, 0.15);
                                            }
                                        }
                                    `}
                    </style>
                    {/* Main window sections */}
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            width: "100%",
                            height: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                flex: 0.35,
                                position: "relative",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background:
                                        "linear-gradient(to bottom left, rgba(0, 0, 0, 0.6), transparent), linear-gradient(to bottom right, rgba(0, 0, 0, 0.6), transparent)",
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "10%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                }}
                            >
                                Artifacts
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                borderTop: "4px solid #2a2a2a",
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "5%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                }}
                            >
                                Level 4
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                                borderTopLeftRadius: "100%",
                                borderTopRightRadius: "100%",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: "-182%",
                                    left: 5, // Gradient starts from the left
                                    right: "50%", // Gradient ends at the right
                                    bottom: 0, // Extend to the bottom for a full half circle
                                    background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                    borderTopLeftRadius: "200%", // Half-circle cut on the top left
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: "-180%",
                                    left: "50%", // Gradient starts from the left
                                    right: 5, // Gradient ends at the right
                                    bottom: 0, // Extend to the bottom for a full half circle
                                    background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    borderTopRightRadius: "200%", // Half-circle cut on the top left
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "5%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                }}
                            >
                                Level 3
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: "50%", // Gradient only till the middle
                                    right: 0,
                                    bottom: 0,
                                    background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    right: "50%", // Gradient only till the middle
                                    bottom: 0,
                                    left: 0,
                                    background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "5%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                }}
                            >
                                Level 2
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                                "&::before": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    left: "50%", // Gradient only till the middle
                                    right: 0,
                                    bottom: 0,
                                    background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                },
                                "&::after": {
                                    content: '""',
                                    position: "absolute",
                                    top: 0,
                                    right: "50%", // Gradient only till the middle
                                    bottom: 0,
                                    left: 0,
                                    background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: "5%",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    color: "#ffffff",
                                    fontWeight: "bold",
                                    fontSize: "1.2rem",
                                }}
                            >
                                Level 1
                            </Box>
                        </Box>

                        {/* Augments */}
                        <Box
                            sx={{
                                flex: 0.4,
                                display: "flex",
                                flexDirection: "row",
                                borderTop: "4px solid #2a2a2a",
                                borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                            }}
                        >
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "0%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.5rem",
                                    }}
                                >
                                    You
                                </Box>
                            </Box>
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "0%",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        color: "#ffffff",
                                        fontWeight: "bold",
                                        fontSize: "1.5rem",
                                    }}
                                >
                                    Opponent
                                </Box>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                flex: 0.4,
                                display: "flex",
                                flexDirection: "row",
                                // borderBottom: "4px solid #2a2a2a",
                                position: "relative",
                            }}
                        >
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to right, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            />
                            <Box
                                sx={{
                                    flex: 0.5,
                                    position: "relative",
                                    "&::before": {
                                        content: '""',
                                        position: "absolute",
                                        top: "0%",
                                        left: "0%",
                                        right: "0%",
                                        bottom: "0%",
                                        background: "linear-gradient(to left, rgba(0, 0, 0, 1), transparent)",
                                    },
                                }}
                            />
                        </Box>
                    </Box>
                </Sheet>
            </Box>
        </div>
    );
};

export default StainedGlassWindow;
