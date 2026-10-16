/**
 * Window event that opens the friends panel from anywhere (the sandbox's "Invite a friend" badge, a
 * spectator's "Back to friends"). Kept in its own module so importers never pull the lazily loaded
 * SocialDockRuntime, which listens for it, into their own bundle.
 */
export const OPEN_FRIENDS_EVENT = "hoc:open-friends";

export const openFriendsPanel = (): void => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(OPEN_FRIENDS_EVENT));
    }
};
