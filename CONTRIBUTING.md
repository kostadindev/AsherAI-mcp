# Contributing

1. `npm install`, then `npm run check` (typecheck, lint, tests with coverage). CI runs the same on Node 20 and 22,
   plus `npm run build` and `npm run accuracy`.
2. **Adding a detector** (`src/detectors.ts`): give it a category (`cat1` prohibited, `cat2` not for AI) and a
   plain label. Add at least three positive and three negative cases to `test/detectors.test.ts`, including
   benign lookalikes (invoice numbers, years, prices, version strings). Prefer missing a case to flagging
   ordinary text. Then run `npm run accuracy`: the tuning corpus must stay above its targets, and report the
   held-out numbers honestly in the README.
3. Never let a raw restricted value reach a log, tool reply or report. `test/gateway-workspace.test.ts` checks
   this on disk and in the report.
4. Open a pull request describing what you changed and how you tested it.
