import { componentConsoleCss } from "./styles-components.js";
import { evidenceConsoleCss } from "./styles-evidence.js";
import { foundationConsoleCss } from "./styles-foundation.js";
import { responsiveConsoleCss } from "./styles-responsive.js";
import { shellConsoleCss } from "./styles-shell.js";

export const styleNonce = "audit-grade-rag-style";
export const consoleCss = `${foundationConsoleCss}${shellConsoleCss}${componentConsoleCss}${evidenceConsoleCss}${responsiveConsoleCss}`;
