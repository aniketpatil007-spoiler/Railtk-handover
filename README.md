# Rail Handover

Rail Handover helps Indian Railways passengers save journeys and tickets, check passenger-level PNR status, and prepare family name-change requests.

[Open Rail Handover](https://rail-handover.sagetick64.chatgpt.site)

## Features

- Private saved journeys and linked PNRs.
- Automatic passenger status lookup with API Mitra, plus a link to official Indian Railways enquiry and a clearly labeled manual fallback.
- A family name-change eligibility check, printable request letter, deadline, and document checklist. Railway staff handle submission and approval at the reservation office.
- Browser notifications for request letters when the user enables them.

## Build

Use Node.js 22 or later. There are no npm dependencies.

```sh
node scripts/build.mjs
node --input-type=module --check < dist/server/index.js
```

The generated Worker depends on ChatGPT Sites for sign-in and the `BUCKET` storage binding. To deploy your own copy, create a Sites project, copy `.openai/hosting.example.json` to `.openai/hosting.json`, substitute your project ID, rebuild, and deploy the generated Worker through Sites. GitHub stores this source. GitHub Pages alone cannot run the Worker, provide Sites sign-in, or handle private ticket storage.

Set `APIMITRA_API_KEY` as a server secret in the Sites project and redeploy so the Worker receives it. The example environment file documents the variable name. Production keys, user records, and live hosting identifiers are excluded from this repository.

## Source layout

- `web/` contains the pages, styles, and browser scripts.
- `worker/` contains authenticated routes, storage operations, and PNR integration.
- `scripts/build.mjs` bundles the frontend and Worker into the deployment output.
