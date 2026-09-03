import { LobbyStatus } from "@heroesofcrypto/common";

import { t } from "../i18n/i18n";

export const lobbyStatusLabel = (status: number | undefined): string => {
    switch (status) {
        case LobbyStatus.LOBBY_FULL:
            return t("Full");
        case LobbyStatus.LOBBY_STARTING:
            return t("Starting");
        case LobbyStatus.LOBBY_STARTED:
            return t("In game");
        default:
            return t("Open");
    }
};
