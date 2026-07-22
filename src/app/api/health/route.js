import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cached — a probe must hit the live process

// Lightweight liveness probe for uptime monitors / load-balancer health checks.
// Intentionally does NO Firebase or network I/O: it answers only "is the app
// process up and serving?", so a downstream dependency blip can't turn it red,
// and it can't leak anything. Returns 200 while the process is alive.
export function GET() {
  return NextResponse.json({ ok: true, status: "ok" });
}
