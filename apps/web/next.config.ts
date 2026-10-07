import type { NextConfig } from "next";

// Clickjacking and sniffing defenses for every route. CSP is frame-ancestors only: a script-src
// policy would block the inline scripts Next emits for hydration unless nonces are wired in.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Not no-referrer: Chrome then posts pre-hydration Server Action forms with Origin: null, which Next rejects.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default nextConfig;
