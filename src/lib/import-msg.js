// Render an import validation message ({ key, params }) in a locale-bound `t`.
// import-parse.js emits messages as codes + params (never baked English), so the
// owner-only import preview localizes like the rest of the Admin tab. Two params
// need per-token localization before interpolation:
//   - `changed`: a list of field names (e.g. ["unit","barcode"]) joined with
//     each field word localized;
//   - `atLoc`: an optional "at <location>" clause folded into `{at}`.
// Everything else is a straight catalog lookup.
import { translate } from "./i18n.js";

export function renderImportMsg(msg, t) {
  if (!msg || typeof msg !== "object" || !msg.key) return String(msg ?? "");
  const p = { ...(msg.params || {}) };
  if (Array.isArray(p.changed)) p.changed = p.changed.map((f) => t(`imp.changed.${f}`)).join(", ");
  if ("atLoc" in p) p.at = p.atLoc ? t("imp.at_loc", { loc: p.atLoc }) : "";
  return t(msg.key, p);
}

// English renderer used by import-parse.js so a message stringifies to the exact
// English every server surface and the existing tests expect.
export const importMsgEn = (msg) => renderImportMsg(msg, (k, v) => translate("en", k, v));
