# Contributing

1. `npm install`, then `npm run check` (typecheck, lint, tests with coverage). CI runs the same on Node 20 and 22,
   plus `npm run build`, `npm run test:package` (installs the packed tarball and drives its bins) and
   `npm run accuracy`.
2. **Adding a detector** (`src/detectors.ts`): give it a category (`cat1` prohibited, `cat2` not for AI) and a
   plain label. Add at least three positive and three negative cases to `test/detectors.test.ts`, including
   benign lookalikes (invoice numbers, years, prices, version strings). Prefer missing a case to flagging
   ordinary text. Then run `npm run accuracy`: the tuning corpus must stay above its targets, and report the
   held-out numbers honestly in the README.
3. Never let a raw restricted value reach the session log, a report, the audit log or a tool diagnostic
   (refusals, flags, `check_text` results). File content returned by `read_file` is the exception by design:
   in `monitor` mode it is the original text, in `enforce` mode it is redacted. `test/gateway-workspace.test.ts`
   checks the log on disk and the report.
4. Open a pull request describing what you changed and how you tested it.
