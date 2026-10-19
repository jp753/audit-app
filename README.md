# Training System Audit

An offline, installable web app (PWA) for auditing a client's training and
competence system on an Android phone. It produces a client report (PDF) and a
separate action list (PDF and Excel).

- Everything is stored on the phone (IndexedDB). No accounts, cloud, analytics
  or network calls.
- **No criteria are included in this repository.** The criteria library is
  private and is imported on the phone from a JSON file on first launch.
  Tests use a small made-up sample (`tests/fixtures/sample_library.json`).

## For developers

```
npm install
npm run dev        # local development
npm test           # automated tests
npm run build      # production build into dist/
npm run check-private   # confirm no private criteria text is in the repo
```

`check-private` compares the repository against `private/audit_criteria.json`,
which is git-ignored and must stay on your own machine.

Pushing to `main` builds the app and publishes it to the `gh-pages` branch,
which GitHub Pages serves at https://jp753.github.io/audit-app/.
