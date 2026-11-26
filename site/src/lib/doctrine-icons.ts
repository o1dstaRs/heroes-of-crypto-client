import type { DoctrineProperties } from "@heroesofcrypto/common/src/doctrines/doctrine_properties";
import { catalogIconUrl } from "./catalog-icon";

export const doctrineIconUrl = (doctrine: DoctrineProperties): string =>
    catalogIconUrl(`/assets/images/doctrines/${doctrine.imageKey}.webp`);
