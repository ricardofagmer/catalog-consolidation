# 09: Web on the API

**What to build:** The Next.js app reads and writes only through the API. Server Components and the review Server Action call the generated client from the Next server; the browser never contacts the API. All database code and the startup database check are removed from the web app, which now validates `API_BASE_URL` at startup and checks API readiness. Existing anti-framing headers and the Host allowlist stay. Unknown or malformed product ids give real 404s. `packages/core` is deleted now that no consumer remains.

**Blocked by:** 08

**Closes checks:** C24, C25, C32, C33, C34

**Status:** done

- [ ] No `node:sqlite` and no backend library import exists in the web app, its dependencies declare no backend project, and lint passes
- [ ] Loading all pages shows no browser request to port 3001; the API log shows the calls from the Next server
- [ ] `curl -I` shows frame-ancestors none, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy; a bad `Host` gets 421
- [ ] A missing or malformed API address stops the web server at startup with one `error:` line and exit 1; `next build` succeeds with the API down and the variable unset
- [ ] `/products/abc` and `/products/999999` return HTTP 404 with the not-found page; a valid product returns 200
- [ ] The review resolve flow still works end to end through the API in the browser
- [ ] The web pages look and behave as before; visual changes are the next tickets

## Comments
