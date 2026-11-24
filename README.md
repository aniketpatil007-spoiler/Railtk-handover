# Rail Handover

Rail Handover is a mobile-friendly dashboard for Indian Railways passengers. It helps them plan journeys, save tickets, check passenger-level PNR status, and prepare family name-change requests when an eligible passenger cannot travel.

[Open Rail Handover](https://rail-handover.sagetick64.chatgpt.site)

## Core Sections & Architecture

The application is built around four primary sections inspired by the ease of navigation in ConfirmTkt, combined with Rail Handover's clean design identity:

1. **Find Trains:** Search Indian Railways routes, plan journeys with date helpers (Today, Tomorrow, +7 Days), swap stations with one tap, save journey requests or private tickets, and link directly to IRCTC for live seats and booking.
2. **PNR Status (PNR Status Agent):** Real-time passenger reservation lookup powered by API Mitra. Shows coach, berth, chart preparation status, and current status for every passenger. Enforces the strict rule that "All passengers confirmed" is displayed only when every passenger's current status is confirmed. If a refresh fails, the previous status and IST timestamp are preserved with an explanation of whether the issue is missing credentials, provider rejection, rate limiting, or an outage. Includes official Indian Railways enquiry fallback and manual status reporting marked as *Reported status · Entered by you*.
3. **My Trips:** Displays all saved route requests and held tickets with masked PNRs (`******1234`), journey dates, train details, individual passenger badges, and last checked time in IST. Each ticket provides instant *Check Status* and *Prepare Family Name-Change Request* buttons.
4. **Family Handover (Family Name-Change Assistant):** Guides passengers through Indian Railways Rule 229 eligibility:
   - Confirmed reservation requirement (RAC and Waitlisted tickets are blocked).
   - Qualifying direct family relationships (Father, Mother, Brother, Sister, Son, Daughter, Husband, Wife).
   - One-time change restriction (prior name-change checks).
   - Dynamic 24-hour deadline calculation in IST from scheduled departure.
   - Comprehensive document checklist for the Railway Reservation Office (Chief Reservation Supervisor).
   - Editable, printable formal application letter ready for submission, with opt-in browser notification when ready.

## Security & Data Privacy

- **Server-Side Ownership Checks:** All private journeys and PNR status records are isolated per authenticated user in Cloudflare R2 / ChatGPT Sites `BUCKET` storage (`journeys/{userId}/...` and `pnr/{userId}/...`). Cross-account access is strictly blocked.
- **PNR Masking:** PNRs are masked in summaries and card displays (e.g. `******7890`) and omitted from logs.
- **Credential Protection:** `APIMITRA_API_KEY` is loaded exclusively from the server environment / secrets settings and is never exposed in client requests, logs, or source code.

## Build & Test

Use Node.js 22 or later. There are no npm dependencies.

```sh
# Build the client and worker bundle
node scripts/build.mjs

# Syntax check generated server bundle
node --input-type=module --check < dist/server/index.js

# Run automated verification test suite
node --test tests/*.test.mjs
```

## Test Coverage

The test suite in `tests/` verifies:
- `tests/pnr-status.test.mjs`: Tests PNR input validation, masking, API Mitra parsing with mixed passenger statuses (1 Confirmed, 1 RAC, 1 Waitlisted), strict enforcement of "All passengers confirmed", failed lookup preservation with specific error codes (`missing_credentials`, `provider_rejection`, `rate_limited`, `provider_outage`), and manual status reporting (`PUT`).
- `tests/family-handover.test.mjs`: Tests eligibility against Indian Railways Rule 229 (confirmed status, qualifying relationship, one-time rule, booking circumstances, and 24-hour deadline in IST).
- `tests/cross-account.test.mjs`: Tests server-side ownership checks ensuring User B cannot read, modify, or delete User A's journeys or PNR records.
- `tests/live-pnr-check.mjs`: Tests live API Mitra endpoint connectivity and credential reporting.

## Deployment

The generated Worker depends on ChatGPT Sites for authentication headers (`oai-authenticated-user-id`, `oai-authenticated-user-email`) and the `BUCKET` storage binding.

1. Create a Sites project or configure `.openai/hosting.json` with your project ID.
2. Set `APIMITRA_API_KEY` as a server secret in your hosting project settings.
3. Run `node scripts/build.mjs`.
4. Deploy the generated Worker through Sites.
