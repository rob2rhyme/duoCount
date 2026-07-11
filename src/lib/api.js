// One place that turns a fetch() into a parsed JSON object — and, crucially,
// turns a NON-JSON (or non-object) response into a clear, actionable Error
// instead of the cryptic `Unexpected token '<', "<!DOCTYPE "... is not valid
// JSON` that res.json() throws when it meets an HTML body.
//
// The API routes always answer with a JSON object (every handler wraps its
// body in try/catch and returns NextResponse.json, even on error). So a body
// that isn't a JSON object means the request never reached the handler — a
// Vercel/Next platform page served in its place: a 404 (stale deployment or
// wrong URL), an auth challenge (Deployment Protection), a 5xx, or a function
// timeout. Those are worth naming for the user rather than hiding behind a
// parse error.

export async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (cause) {
    throw new Error("Network error — check your connection and try again.", { cause });
  }

  let body;
  try {
    body = await res.text();
  } catch (cause) {
    throw new Error("Network error — the connection dropped mid-response. Try again.", { cause });
  }

  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(nonJsonMessage(res.status));
    }
    // Valid JSON that isn't an object (a bare scalar, null, or array) is never
    // something this app's routes send — treat it like any other non-JSON body
    // so a real error can't hide behind a missing `.error`, and so the success
    // path always returns a real object.
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(nonJsonMessage(res.status));
    }
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (HTTP ${res.status}).`);
  }
  return data || {};
}

function nonJsonMessage(status) {
  if (status === 404)
    return "That request hit a 404 — the API route wasn't found. Most often the app is open in an old browser tab (reload the page), or the deployment is still updating.";
  if (status === 405)
    return "The API route rejected this request method (HTTP 405). The deployment may be mid-update — reload and try again.";
  if (status === 401 || status === 403)
    return `Access was blocked (HTTP ${status}). Most often this is Vercel Deployment Protection on a preview/protected deployment — disable it (Settings → Deployment Protection) or use the production URL.`;
  if (status === 408 || status === 504)
    return `The server took too long to respond (HTTP ${status}) — the function likely timed out. Check the Vercel function logs; a hanging Firestore call usually means Firestore isn't reachable or enabled yet.`;
  if (status >= 500)
    return `The server returned an error page (HTTP ${status}) — the function crashed or timed out. Check the Vercel function logs, and confirm the Firebase env vars and Firestore are configured.`;
  return `Unexpected non-JSON response from the server (HTTP ${status}).`;
}
