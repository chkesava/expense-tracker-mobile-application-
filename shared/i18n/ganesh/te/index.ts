import { type GaneshCatalog } from "../keys";

import { common } from "./common";
import { language } from "./language";
import { nav } from "./nav";

/**
 * Each namespace is already typed against its English counterpart, so a missing
 * or invented key fails inside that namespace file. This annotation is the
 * second net: it catches a namespace that was written but never spread in.
 */
export const te: GaneshCatalog = {
  ...common,
  ...language,
  ...nav,
};
