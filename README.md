# Training System Audit

An offline, installable web app (PWA) for auditing a client's training and
competence system on an Android phone. It produces a client report (PDF) and a
separate action list (PDF and Excel).

- Everything is stored on the phone (IndexedDB). No accounts, cloud, analytics
  or network calls.
- **No criteria are included in this repository.** The criteria library is
  private and is imported on the phone from a JSON file on first launch.
  Tests use a small made-up sample (`tests/fixtures/sample_library.json`).

Live app: https://jp753.github.io/audit-app/

## Plain-English guide

### Put it on GitHub Pages (one time)
1. On github.com open **jp753/audit-app** → **Settings** → **Pages**.
2. Source: **Deploy from a branch**. Branch: **gh-pages**, folder **/ (root)**. Save.
3. After a couple of minutes the app is at https://jp753.github.io/audit-app/.

Every time new code is pushed, GitHub tests it, builds it and republishes it
automatically (see the **Actions** tab).

### Install on your Android phone
1. Open https://jp753.github.io/audit-app/ in **Chrome**.
2. Tap the **⋮** menu → **Install app** (or **Add to Home screen**) → **Install**.
3. Open it from the home-screen icon. It opens full screen.
4. Tap **Choose criteria file** and pick your `audit_criteria.json`.
5. Turn on airplane mode and open the app once to confirm it works offline.

### Update it later without losing data
- Your data lives on the phone, not on GitHub, so updates never touch it.
- When a new version is published, open the app with signal. A banner says
  **"A new version is ready"**. Tap **Update**.
- Before big changes, make a backup: **Settings → Back up everything**, and
  copy the file to your PC.
- Never use Chrome's "Clear site data" or uninstall the app unless you have a
  recent backup. To move to a new phone: install, then tap
  **Restore from a backup** on the first screen.

## For developers

```
npm install
npm run dev            # local development
npm test               # automated tests
npm run build          # production build into dist/
npm run check-private  # confirm no private criteria text is in the repo
```

`check-private` compares the repository against `private/audit_criteria.json`,
which is git-ignored and must stay on your own machine.

Libraries: Preact (screens), idb (on-phone storage), pdfmake (PDFs),
ExcelJS (Excel), vite-plugin-pwa (offline/install), Arimo font (metric
equivalent of Arial, bundled).
