# Actual Budget Spending Dashboard

A browser-only, read-only dashboard built from Actual's official `browser-app-demo`. It connects directly to an Actual sync server (including a PikaPods instance), downloads and decrypts the budget in the browser, and displays the 12 most recently completed months.

## Run locally

Requirements: Node.js 22 or newer and Corepack.

```sh
corepack enable
yarn install
yarn dev
```

Open the local Vite address and choose **Try the demo** to see synthetic data, or connect using the server password and optional end-to-end encryption key. Your server URL and Sync ID are set in `src/config.ts`, so the form does not ask for them. After a successful connection, the password and encryption key are kept in this tab's `sessionStorage` so a reload can reconnect; Disconnect clears them, and closing the tab ends the session. Scripts running on this dashboard origin can access browser session storage.

The dashboard also saves the latest read-only snapshot in IndexedDB. On reload, it displays that cached snapshot immediately, then reconnects and refreshes from Actual in the background. The header shows the last successful refresh and has an **Update** button. If the update fails, the cached snapshot remains visible. Actual's browser engine separately stores its downloaded budget cache in IndexedDB on this device.

The server password is the password used to sign in to Actual; enter the encryption key only when the budget uses end-to-end encryption. The server URL and Sync ID in `src/config.ts` are included in the built JavaScript and are visible to anyone who can access the dashboard. Keep the password and encryption key out of source files and the repository.

## Analysis rules

- Uses the 12 completed calendar months before the current month.
- Outflows display as positive expenses. Positive transactions in expense categories offset spending as refunds.
- Excludes income and starting-balance categories, transfers, off-budget accounts, and transactions whose notes contain `#noise` or `#payment`.
- Includes uncategorized outflows.
- Total spending and monthly average appear first, followed by one KPI card for each non-income category group with Uncategorized shown as its own group when present. Group cards use the same filtered transaction set.
- The app only calls Actual read methods. It never changes the budget.

Category colors are deterministic for each category ID and remain the same between reloads.

## Build and preview

```sh
yarn build
yarn preview
```

The preview server sets the required headers. The production static site is in `dist/`.

Run the analysis suite and TypeScript check with `yarn test` and `yarn typecheck`.

## Deploy to Cloudflare Pages or Netlify

Set the build command to `yarn build` and the output directory to `dist`. The included `public/_headers` file is copied to the build output and sets:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers are required because Actual's browser API uses `SharedArrayBuffer`. The application origin must also use HTTPS. Actual's current sync server applies permissive CORS middleware by default, so the dashboard can connect cross-origin; if a proxy in front of Actual overrides CORS, it must allow the dashboard origin and the Actual API request headers/methods. Do not add the password or encryption key to hosting environment variables or source files.

## Deploy to GitHub Pages

The included `.github/workflows/deploy.yml` builds and publishes `dist/` on pushes to `main` and supports manual runs. Push this project to a repository you own, then open **Settings → Pages** and set the publishing source to **GitHub Actions**. The Vite build uses relative asset paths so it works at the project URL under `/repository-name/`. GitHub Pages does not let a repository set COOP/COEP response headers; `index.html` registers the included `coi-serviceworker.js` to provide cross-origin isolation in the browser. The first visit may reload once while the service worker takes control.

On GitHub Free, Pages requires a public repository and the published site is publicly accessible. Anyone who opens the page can see the configured server URL and Sync ID and can attempt to connect; they still need a valid password for that Actual server (and the end-to-end encryption key, if enabled) to read the budget. Actual budget data is processed in the visitor's browser. If you need the published site itself to be private, GitHub Pages access control is limited to GitHub Enterprise Cloud organization sites.

## Current Actual browser API requirements

This app is based on the official [`actualbudget/browser-app-demo`](https://github.com/actualbudget/browser-app-demo), cloned at commit `f78043a` (2026-10-10), using `@actual-app/api` `^26.10.0`. The browser integration is in `src/snapshot/actual-browser.ts` and uses `init`, `downloadBudget`, `getAccounts`, `getTransactions`, `getCategories`, `getCategoryGroups`, `getPayees`, and `getPreferences`. It passes transaction `notes` through to the local analysis for the requested tag exclusions.

Actual documents that the browser API runs its SQLite/WASM engine in a Web Worker, stores its data in IndexedDB, and requires cross-origin isolation: HTTPS, `Cross-Origin-Opener-Policy: same-origin`, and `Cross-Origin-Embedder-Policy: require-corp`. See [Actual API docs](https://actualbudget.org/docs/api/) and [SharedArrayBuffer setup](https://actualbudget.org/docs/troubleshooting/shared-array-buffer/).

The browser API remains an experimental Actual interface; re-check Actual's documentation and the official demo when updating the API package.
