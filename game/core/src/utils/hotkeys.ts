export interface HotKey {
    description: string;
    key: string;
    step: boolean;
    callback: (down: boolean) => void;
}

export function hotKey(key: string, description: string, callback: (down: boolean) => void, step = false): HotKey {
    return {
        key,
        description,
        callback,
        step,
    };
}

export function hotKeyPress(key: string, description: string, callback: () => void) {
    return hotKey(key, description, (down) => {
        if (down) callback();
    });
}
