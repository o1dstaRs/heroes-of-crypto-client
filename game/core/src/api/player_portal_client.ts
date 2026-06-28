import { ResponsePlayerPortal, type ResponsePlayerPortalObject } from "@heroesofcrypto/common";
import { v4 as uuidv4 } from "uuid";

import { axiosAuthInstance, buildApiUrl, endpoints, HOST_AUTH_API } from "./axios";

const STORAGE_KEY = "accessToken";

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
    return {
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

const toBytes = (data: unknown): Uint8Array => {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return new Uint8Array(0);
};

/** Fetch the aggregated player-portal payload for the authenticated player. */
export const fetchPlayerPortal = async (): Promise<ResponsePlayerPortalObject> => {
    const url = buildApiUrl(HOST_AUTH_API, endpoints.auth.portal);
    const response = await axiosAuthInstance.get(url, {
        responseType: "arraybuffer",
        headers: authHeaders(),
    });
    return ResponsePlayerPortal.deserializeBinary(toBytes(response.data)).toObject();
};
