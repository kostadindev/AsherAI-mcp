# Contributing

1. `npm install`, then `npm test`. All three suites must pass.
2. **Adding a detector** (`src/detectors.ts`): give it a category (`cat1` prohibited, `cat2` not for AI) and a
   plain label. Add at least three positive and three negative cases to `test/detectors.test.ts`, including
   benign lookalikes (invoice numbers, years, prices, version strings). Prefer missing a case to flagging
   ordinary text.
3. Never let a raw restricted value reach a log, tool reply or report. The smoke tests check this.
4. Open a pull request describing what you changed and how you tested it.
