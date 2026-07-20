// Pure font-format detection by MAGIC BYTES — the server-trusted check behind the
// custom-font upload (/api/branding). The client's filename/MIME is never trusted;
// only these leading signatures accept a file as a real font. Returns the CSS
// @font-face `format()` token, or null if the bytes aren't a recognized font.

// Cap the stored bytes well under Firestore's 1 MB document limit (base64 inflates
// ~33%). A single subset woff2 weight is 15–100 KB, so this is generous.
export const MAX_FONT_BYTES = 400 * 1024;

export function sniffFontFormat(buf) {
  if (!buf || buf.length < 4) return null;
  const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3];
  const tag = String.fromCharCode(b0, b1, b2, b3);
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "opentype";                 // OpenType/CFF (.otf)
  if (tag === "true" || tag === "typ1" || tag === "ttcf") return "truetype";
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return "truetype"; // TrueType outlines
  return null;
}
