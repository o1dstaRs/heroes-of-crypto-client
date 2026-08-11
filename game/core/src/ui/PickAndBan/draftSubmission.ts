export type DraftCommit = () => boolean | void | Promise<boolean | void>;

export async function runDraftSubmission(commit: DraftCommit): Promise<boolean> {
    try {
        return (await commit()) !== false;
    } catch {
        return false;
    }
}
