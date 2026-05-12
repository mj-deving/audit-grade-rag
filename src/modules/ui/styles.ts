import { componentConsoleCss } from "./styles-components.js";
import { foundationConsoleCss } from "./styles-foundation.js";
import { responsiveConsoleCss } from "./styles-responsive.js";

export const styleNonce = "audit-grade-rag-style";
export const consoleCss = `${foundationConsoleCss}${componentConsoleCss}${responsiveConsoleCss}`;
