// Client-side screenshot downscaling for support tickets. There is no image
// upload pipeline in this app (Firebase Storage is unused), so a screenshot is
// stored inline as a downscaled base64 data-URI. This keeps each image well
// under the support route's per-image cap (support.js ATTACH_MAX_BYTES) and the
// ticket doc under Firestore's 1 MB limit — a phone screenshot is often 2–4 MB
// raw, so we resize the long edge and re-encode as JPEG.
//
// Browser-only (needs <canvas> + Image). Returns { dataUri, name } or throws a
// coded error the caller localizes.

const MAX_EDGE = 1400;   // longest side, px — legible for a UI screenshot
const QUALITY = 0.7;     // JPEG quality
const HARD_MAX = 360 * 1024; // must match support.js ATTACH_MAX_BYTES

const bytesOf = (dataUri) => {
  const i = dataUri.indexOf("base64,");
  if (i < 0) return 0;
  const b64 = dataUri.slice(i + 7);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - pad;
};

export function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(Object.assign(new Error("not an image"), { code: "attach_type" })); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        // A white matte so a transparent PNG doesn't turn black under JPEG.
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // Step quality down until it fits the hard cap (rare for a UI shot).
        let q = QUALITY;
        let dataUri = canvas.toDataURL("image/jpeg", q);
        while (bytesOf(dataUri) > HARD_MAX && q > 0.3) {
          q -= 0.15;
          dataUri = canvas.toDataURL("image/jpeg", q);
        }
        if (bytesOf(dataUri) > HARD_MAX) { reject(Object.assign(new Error("too big"), { code: "attach_big" })); return; }
        const name = String(file.name || "screenshot").replace(/\.[^.]+$/, "").slice(0, 60) + ".jpg";
        resolve({ dataUri, name });
      } catch (e) { reject(Object.assign(new Error("decode failed"), { code: "attach_bad" })); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Object.assign(new Error("load failed"), { code: "attach_bad" })); };
    img.src = url;
  });
}
