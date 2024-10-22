import React, { useEffect } from "react";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import Slider from "@mui/joy/Slider";
import Button from "@mui/joy/Button";

interface IUnitSplitterProps {
    totalUnits: number;
    onSplit: (split1: number, split2: number) => void;
}

const UnitSplitter = (props: IUnitSplitterProps) => {
    const [splitValue, setSplitValue] = React.useState(1); // Start with minimum value

    // Reset slider value whenever totalUnits changes
    useEffect(() => {
        setSplitValue(1); // Reset to minimum value when a new unit is selected
    }, [props.totalUnits]);

    const handleSliderChange = (event: Event, newValue: number | number[]) => {
        setSplitValue(newValue as number);
    };

    const handleAcceptSplit = () => {
        const group1 = splitValue;
        const group2 = props.totalUnits - splitValue;
        props.onSplit(group1, group2);
    };

    return (
        <Box sx={{ width: "100%", maxWidth: 400, marginTop: 3 }}>
            <Stack spacing={2} alignItems="center">
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Typography level="body-sm">{splitValue}</Typography>
                    <Typography level="body-sm">{props.totalUnits - splitValue}</Typography>
                </Box>

                <Slider
                    sx={{
                        padding: "4px 0",
                        height: 10, // Increase the height of the track (thickness)
                        "& .MuiSlider-thumb": {
                            width: 20, // Increase thumb size
                            height: 20,
                        },
                        "& .MuiSlider-rail": {
                            height: 10, // Increase rail thickness
                        },
                        "& .MuiSlider-track": {
                            height: 10, // Increase track thickness
                        },
                    }}
                    value={splitValue}
                    onChange={handleSliderChange}
                    min={1}
                    max={props.totalUnits - 1}
                    step={1}
                    aria-label="Unit Split Slider"
                />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ marginTop: 2, marginBottom: 2 }}>
                <Button variant="solid" color="primary" onClick={handleAcceptSplit} sx={{ flexGrow: 1 }}>
                    Split
                </Button>
            </Stack>
        </Box>
    );
};

export default UnitSplitter;
