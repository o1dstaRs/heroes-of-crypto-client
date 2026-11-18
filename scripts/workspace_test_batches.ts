const DEFAULT_WORKSPACE_TEST_BATCH_SIZE = 10;

/** Smaller batches release retained test VMs sooner without changing discovery or timeouts. */
export function workspaceTestBatchSize(value: string | undefined): number {
    const size = Number(value ?? DEFAULT_WORKSPACE_TEST_BATCH_SIZE);
    if (!Number.isSafeInteger(size) || size < 1 || size > DEFAULT_WORKSPACE_TEST_BATCH_SIZE) {
        throw new Error("HOC_WORKSPACE_TEST_BATCH_SIZE must be an integer from 1 to 10");
    }
    return size;
}
