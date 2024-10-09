import React, { useEffect } from "react";

interface DamageBubbleProps {
    damages: number[];
    coordinates: { x: number; y: number };
}

const DamageBubble: React.FC<DamageBubbleProps> = ({ damages, coordinates }) => {
    return (
        <>
            {damages.map((damage, index) => {
                return <SingleDamageBubble key={`${damage}-${index}`} damage={damage} coordinates={coordinates} />;
            })}
        </>
    );
};

interface SingleDamageBubbleProps {
    damage: number;
    coordinates: { x: number; y: number };
}

const SingleDamageBubble: React.FC<SingleDamageBubbleProps> = ({ damage, coordinates }) => {
    const [visible, setVisible] = React.useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <div
            style={{
                position: "absolute",
                top: coordinates.y - 80,
                left: coordinates.x + 40,
                backgroundColor: "red",
                color: "white",
                padding: "10px",
                borderRadius: "50%",
                fontSize: "20px",
                transform: "scale(1)",
                animation: "enlarge 2s forwards",
                pointerEvents: "none",
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
