import { NextResponse, type NextRequest } from "next/server";

// DNS rebinding: a hostile page can point its own name at 127.0.0.1 and reach this server from the
// victim's browser, but the browser still sends the attacker's name in Host. Only the two loopback
// origins the package scripts bind to (`-H 127.0.0.1 -p 3000`) are accepted.
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1:3000", "localhost:3000"]);
const MISDIRECTED_REQUEST_STATUS = 421;

export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get("host");
  if (host === null || !ALLOWED_HOSTS.has(host)) {
    return new NextResponse(null, { status: MISDIRECTED_REQUEST_STATUS });
  }
  return NextResponse.next();
}
