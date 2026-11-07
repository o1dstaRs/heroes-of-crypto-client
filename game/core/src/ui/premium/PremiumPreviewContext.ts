import { createContext } from "react";
import type { PremiumAdvice } from "../../api/premium_client";

/** Supplied exclusively by a local dev route, outside the real account/authentication context. */
export const PremiumPreviewContext = createContext<PremiumAdvice | undefined>(undefined);
