# Pari Dental Hospital – clinic app (demo)

Frontend-only demo of a clinic management app for Pari Dental Hospital, Kamarajapuram, Chennai.
No backend: everything lives in `localStorage` (`pariDental.v1`), seeded with a sample clinic on first load.
Open it in two tabs — reception in one, doctor in the other — and they stay in sync.

- Reception: `#/front-desk` · Doctor: `#/doctor` · Patient QR form: `#/form`
- **Reset demo data** is under Doctor › Clinic › Settings. The sample day is rebuilt automatically each new day.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint && npm test && npm run e2e
BASE_URL=https://example.vercel.app npx playwright test   # run the UAT suite against a deployment
```

## Layout

- `src/data/` – seed, store (localStorage + `storage` event), selectors, actions
- `src/logic/` – pure functions: balance, age, validation, Excel import, follow-ups, inventory, KPIs
- `src/components/` – ToothChart, SignaturePad, Menu (⋯), Modal, controls, Notices, print layouts
- `src/pages/` – one file per screen
- `tests/` – Vitest unit tests · `e2e/` – Playwright UAT journeys with axe checks
- `reference/` – the approved prototype and a sample of the clinic's old Excel sheet

## Deploy

Pushing to `main` deploys to https://pari-dental-demo.vercel.app automatically (Vercel is connected to this repository).
