export const DRAFT_EXIT_DESTINATION = "/play";

type DraftNavigate = (destination: string, options: { replace: boolean }) => void;

/** Release the active server match before returning to the new-game screen. */
export async function leaveActiveDraft(
    gameId: string,
    abandonGame: (gameId: string) => Promise<void>,
    navigate: DraftNavigate,
): Promise<void> {
    await abandonGame(gameId);
    navigate(DRAFT_EXIT_DESTINATION, { replace: true });
}
