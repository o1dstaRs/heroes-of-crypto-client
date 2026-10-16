import { v4 as uuidv4 } from "uuid";

/**
 * A random id created once per browser install and sent with API requests as X-HoC-Device. The server keeps
 * only a keyed hash of it, to notice several ranked accounts played from one browser (integrity phase 1,
 * disclosed in the privacy policy). It identifies the install, not the person.
 */
export const DEVICE_ID_HEADER = "X-HoC-Device";

const STORAGE_KEY = "hoc:deviceId";
const VALID_DEVICE_ID = /^[A-Za-z0-9-]{16,64}$/;

let memoryDeviceId: string | undefined;

export const getDeviceId = (): string => {
    try {
        if (typeof localStorage !== "undefined") {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && VALID_DEVICE_ID.test(stored)) {
                return stored;
            }
            const created = uuidv4();
            localStorage.setItem(STORAGE_KEY, created);
            return created;
        }
    } catch {
        // Storage blocked (private mode, sandboxed frame): fall back to one id for this page load.
    }
    memoryDeviceId ??= uuidv4();
    return memoryDeviceId;
};

export const deviceIdHeaders = (): Record<string, string> => ({ [DEVICE_ID_HEADER]: getDeviceId() });
