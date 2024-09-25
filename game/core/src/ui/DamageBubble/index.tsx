import React, { useEffect, useState } from "react";

interface DamageBubbleProps {
    damage: number;
    coordinates: { x: number; y: number };
}

const DamageBubble: React.FC<DamageBubbleProps> = ({ damage, coordinates }) => {
    const [visible, setVisible] = useState(true);
    const [key, setKey] = useState(0);

    useEffect(() => {
        setVisible(true); // Reset visibility when damage is received
        setKey((prevKey) => prevKey + 1); // Increment key to trigger new animation

        const timer = setTimeout(() => {
            setVisible(false);
        }, 3000); // Make the bubble disappear after 3 seconds

        return () => clearTimeout(timer); // Cleanup the timer when the component is unmounted
    }, [damage]); // Re-run the effect when damage changes

    if (!visible) return null;

    console.log(`Render Damage ${damage}`);

    return (
        <div
            key={key} // Use key to trigger new animation
            style={{
                position: "absolute",
                top: coordinates.y - 80, // Adjust the bubble above the cursor
                left: coordinates.x + 40, // Slightly right of the cursor
                backgroundColor: "red",
                color: "white",
                padding: "10px",
                borderRadius: "50%",
                fontSize: "20px",
                transform: "scale(1)",
                animation: "enlarge 2s forwards",
                pointerEvents: "none", // Ensure the bubble doesn't interfere with mouse events
                zIndex: 1000,
            }}
        >
            {damage}
        </div>
    );
};

// Add this keyframes animation for enlarging the bubble
const styleSheet = document.styleSheets[0];
const keyframes = `
  @keyframes enlarge {
    0% {
      transform: scale(0.5);
      opacity: 1;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }
`;

styleSheet.insertRule(keyframes, styleSheet.cssRules.length);

export default DamageBubble;
