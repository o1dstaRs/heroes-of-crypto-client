import Button from "@mui/joy/Button";
import React from "react";

import { hocSidebarImageButtonSx } from "./hocTheme";
import { openFriendsPanel } from "./social/openFriendsEvent";

/**
 * "Invite a friend" link shown in the offline sandbox footer for a signed-in player, under "Play Ranked".
 * It opens the friends panel, where each friend row carries "Invite to sandbox": that opens a co-op
 * sandbox with you on green and them on red, and drops a direct-link invite into their tray.
 */
export const InviteFriendBadge: React.FC = () => (
    <Button
        variant="plain"
        type="button"
        onClick={openFriendsPanel}
        aria-label="Invite a friend into a co-op sandbox"
        sx={{
            ...hocSidebarImageButtonSx("neutral"),
            justifySelf: "center",
            width: "min(100%, 209px)",
            height: "35.2px",
            minHeight: "35.2px",
            px: 1,
            backgroundSize: "100% 100%",
            fontSize: "0.924rem",
            fontWeight: 880,
            whiteSpace: "nowrap",
            cursor: "var(--hoc-cursor-interactive), pointer",
        }}
    >
        Invite a friend
    </Button>
);

export default InviteFriendBadge;
