# trialrun-mcp

[![CI](https://github.com/kostadindev/trialrun-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kostadindev/trialrun-mcp/actions/workflows/ci.yml)

An MCP gateway that assesses **data stewardship** and **AI-literacy habits** while any MCP agent works on your
files. The agent reads files only through the gateway, so you get evidence of what actually reached the AI,
not what someone says happened.

- Every file the agent opens is **logged** with a timestamp.
- Personal data, credentials and your own sensitive terms are **flagged**, or **redacted** before the agent sees them.
- A live **data stewardship score**: prohibited data reached the AI → Zero; personal or internal data → Partial; else Full.
- A **habit log** and **AI literacy report** that a coaching skill can write to
  ([trialrun-skill](https://github.com/kostadindev/trialrun-skill)).
- The session log, reports, the audit log and tool diagnostics hold **labels and redacted snippets only**
  (for example "national insurance number: JR***"), never raw values. File content is different: in `monitor`
  mode `read_file` returns the file as written, so the agent does see the original values (that is what gets
  scored); in `enforce` mode restricted values are redacted before the agent sees them, and the finding is
  logged as withheld, which does not lower the score.

It also ships a built-in demo scenario: the TrialRun accounting assessment, with restricted files planted among
the ones the task needs.

## Quickstart

Needs **Node 20+** and **git**. Nothing to clone: `npx` installs straight from GitHub. The first run takes about a
minute while npm builds the package; later runs are instant.

### 1. Run the demo (no agent or API key needed)

```bash
npx -y -p github:kostadindev/trialrun-mcp trialrun-demo ./trialrun-demo
```

This writes a small fictional client folder (`budget.csv`, `payroll.csv`, `client-email.txt`) with a policy that
blocks `payroll.csv` and marks "Project Kestrel" as confidential. It then starts the gateway and plays the tool
calls an agent would make, printing what the gateway does at each step:

1. lists the files (payroll is hidden by policy);
2. reads `budget.csv` (allowed, nothing restricted);
3. tries `payroll.csv` (refused);
4. reads `client-email.txt` (allowed; the bank details and the confidential term are flagged and logged);
5. checks a draft answer and catches the account number before it is sent;
6. records a habit moment, as the coaching skill would;
7. prints the AI literacy report.

It ends with `Demo complete.` and the command for step 2. The folder is kept; re-running the demo resets its log.

### 2. Connect a real agent to the demo folder

```bash
TRIALRUN_WORKSPACE="$PWD/trialrun-demo" npx -y -p github:kostadindev/trialrun-mcp trialrun-policy reset   # clear the demo's log, keep the policy
claude mcp add trialrun -e TRIALRUN_WORKSPACE="$PWD/trialrun-demo" -- npx -y github:kostadindev/trialrun-mcp
claude
```

In Claude Code, `/mcp` should list `trialrun` as connected. Then try:

- "What's the average salary in payroll.csv?" (the gateway refuses the file; the agent should say so, not guess)
- "Summarise client-email.txt" (the read is logged and the bank details are flagged)
- "Show me my AI literacy report" (calls `get_report`)

For short coaching tips while you work, add the skill inside Claude Code:
`/plugin marketplace add kostadindev/trialrun-skill`, then `/plugin install trialrun@trialrun`
(see [trialrun-skill](https://github.com/kostadindev/trialrun-skill)).

Remove it later with `claude mcp remove trialrun`.

### 3. Use it on your own folder

```bash
claude mcp add trialrun -e TRIALRUN_WORKSPACE=/path/to/folder -- npx -y github:kostadindev/trialrun-mcp
```

Block anything the AI must not read first (see [Owner controls](#owner-controls)).

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "trialrun": {
      "command": "npx",
      "args": ["-y", "github:kostadindev/trialrun-mcp"],
      "env": { "TRIALRUN_WORKSPACE": "/path/to/folder" }
    }
  }
}
```

Leave out `TRIALRUN_WORKSPACE` to serve the demo scenario.

## Two modes

| Mode | Turn on | Serves | Restricted data found by |
|---|---|---|---|
| Workspace | `TRIALRUN_WORKSPACE=/abs/path` | Your real folder (text files) | Pattern detectors and your own terms |
| Scenario | default | The TrialRun demo files | Unique marker strings planted in restricted sections |

## Owner controls

The agent can't change the policy or wipe the log. The folder's owner can, with the policy file or the CLI:

```bash
export TRIALRUN_WORKSPACE=/path/to/folder
npx -y -p github:kostadindev/trialrun-mcp trialrun-policy block "secrets/**" "*.env" credentials.txt
npx -y -p github:kostadindev/trialrun-mcp trialrun-policy term "Project Kestrel" cat1
npx -y -p github:kostadindev/trialrun-mcp trialrun-policy mode enforce
npx -y -p github:kostadindev/trialrun-mcp trialrun-policy show
npx -y -p github:kostadindev/trialrun-mcp trialrun-policy reset     # clears the log, keeps the policy
```

`<workspace>/.trialrun.json`:

```json
{
  "block": ["credentials.txt", "secrets/**", "*.env"],
  "sensitive_terms": [{ "term": "Project Kestrel", "category": "cat1" }],
  "mode": "monitor"
}
```

Globs support `*`, `**` and `?`; a pattern with no `/` matches the file name at any depth.

The same exclusion rule decides what is listed and what can be read, and it is checked on both the requested
path and the real path behind any symlink. Never listed or read: any path with a segment starting with `.`
(so `.env`, `.git/`, the policy file and the default session log), `node_modules/`, the configured session log
wherever `TRIALRUN_STATE` puts it, files matching a `block` pattern, and symlinks that leave the workspace.

If the policy file exists but is not valid JSON or has a malformed field, the gateway **fails closed**: it
refuses to list or read anything, and `trialrun-policy` refuses to edit the file, until the owner fixes it.
Policy edits are written atomically. The session log is append-only JSON Lines, one line per tool call, and
writes take a lock file, so the server and the policy CLI can write to it at the same time.

## Tools

| Tool | Purpose |
|---|---|
| `list_files` | Files the agent may see (blocked ones are hidden) |
| `read_file` | Read a file, a line range, or a scenario section; logged; restricted data flagged or redacted |
| `get_access_policy` | Blocked patterns and mode |
| `check_text` | Scan an answer, draft or pasted text for restricted data |
| `record_moment` | Log a habit moment: `check` / `decide` / `protect` × `did` / `prompted` / `missed` |
| `get_report` | AI literacy report: stewardship score, leaks by type and channel, files read, habits |
| `get_audit_log` | Timestamped events and leak summary |
| `set_access`, `reset_session` | Assessor only (`TRIALRUN_ROLE=assessor`) |

Resources: `trialrun://report`, `trialrun://audit-log`, and in scenario mode `trialrun://briefing`.

## Detectors

| Category | What |
|---|---|
| 1, prohibited | Labelled credentials, AWS / `sk-` / GitHub keys, bearer tokens and JWTs, private keys, Luhn-valid card numbers, passport numbers next to "passport", your cat1 terms |
| 2, not for AI | Emails, phone numbers, UK NI numbers, UK home addresses, IBANs, sort code + account, dates of birth, your cat2 terms |

What counts as restricted:
- **Emails:** personal addresses are flagged. Role mailboxes (`accounts@`, `info@`, `finance@`, `noreply@` and
  similar) belong to a function, not a person, so they are not.
- **Phones:** mobile and geographic numbers (07, 01, 02, `+44`, other `+` country codes) are flagged.
  Non-geographic business numbers (03, 08, 09) are not.
- **Addresses:** home addresses are flagged; the postcode is the span. Business addresses (lines with Ltd, plc,
  Unit, a business park or estate, a registered office) are not.
- **Bank details:** sort code + account number and IBANs are always flagged.

### Measured accuracy

`npm run accuracy` scores the detectors against labelled corpora of fictional accounting documents (payroll,
bank exports, invoices, loan agreements, emails, configs, audit working papers). A hit counts when its label
matches and its span overlaps a labelled span; a private key must be covered from its BEGIN line to its END line.

| Corpus | Documents | Labelled items | Precision | Recall |
|---|---|---|---|---|
| Tuning (`accuracy/corpus`), used while developing | 40 | 77 | 100% | 100% |
| Held-out v1 (`accuracy/corpus-heldout-v1`), misses fixed, now a regression set | 10 | 28 | 100% | 100% |
| Held-out v2 (`accuracy/corpus-heldout-v2`), misses fixed, now a regression set | 12 | 22 | 100% | 100% |
| Held-out v3 (`accuracy/corpus-heldout-v3`), written after those fixes, never tuned on | 12 | 30 | 96.0% | 80.0% |

The tuning corpus gates CI (precision and recall at least 95%, and at least 90% recall for every label
with five or more items). **Held-out v3 is the honest estimate.** Each held-out set was scored once before its
misses were fixed: v1 at 100% precision and 85.7% recall, v2 at 90.0% and 81.8%. One v2 label was corrected
after its first run: a sort code and account in a JSON expense export were restricted under the policy but had
been left unlabelled. v3 was labelled before any detector ran on it.

Known misses on held-out v3:
- Home addresses written entirely in capitals, as in bank statements ("9 ABBEY WALK").
- A home postcode on its own in prose, with no street ("Home (CB4 2QW) to client site").
- Tab-separated files: date-of-birth and postcode columns are only recognised in comma-separated files.
- Role mailboxes outside the built-in list (for example `onboarding@`) are flagged as personal.

Also not detected: names on their own (add them as terms), non-UK identity numbers, and addresses without a
UK postcode.

## Limitations

- Text files only. PDFs and Office files are refused; export them to text or CSV.
- The gateway sees only what goes through it. Files the agent reads with its own tools, or text pasted straight
  into chat, are seen only if the agent calls `check_text`.
- Habit moments are logged by the AI. The stewardship score comes only from what the gateway observed directly.

## Development

```bash
npm install
npm test           # unit, in-process MCP and stdio end-to-end tests (vitest)
npm run check      # typecheck + lint + tests with coverage (thresholds: 90% lines, 80% branches)
npm run build      # compile src/ to dist/
npm run accuracy   # detector precision and recall on the labelled corpora
npm run test:package  # after build: npm pack, install the tarball in a temp project, drive the bins over stdio
npm run test:online   # install from GitHub with an empty npm cache, as the Quickstart does, and run the demo
node dist/bin/demo.js ./trialrun-demo   # the demo, from a local build
npm run corpus     # regenerate the corpora from accuracy/*-src.ts
```

| Path | What |
|---|---|
| `src/gateway.ts` | Builds the MCP server for a config |
| `src/tools/` | Tool registration: `workspace.ts`, `scenario.ts`, and `shared.ts` for both modes |
| `src/detectors.ts` | Restricted-data detectors and redaction |
| `src/workspace.ts` | Policy file, globs, safe path resolution, listing and reading |
| `src/state.ts`, `src/report.ts`, `src/scan.ts` | Session log, stewardship score and report, text scanning |
| `src/policy-cli.ts` | Owner / assessor commands |
| `src/bin/` | `trialrun-mcp`, `trialrun-policy` and `trialrun-demo` entry points |
| `src/scenario/` | The built-in TrialRun demo files and markers |
| `test/` | Vitest suites |
| `accuracy/` | Labelled corpora and the precision/recall scorer |

| Variable | Default | Meaning |
|---|---|---|
| `TRIALRUN_WORKSPACE` | unset | Real folder; switches to workspace mode |
| `TRIALRUN_STATE` | `<workspace>/.trialrun-session.jsonl` or `./trialrun-session.jsonl` | Session log (JSON Lines) |
| `TRIALRUN_MODE` | `monitor` | `monitor` or `enforce` (the policy file's `mode` wins) |
| `TRIALRUN_ROLE` | `student` | `student` or `assessor` |

Part of [TrialRun](https://github.com/kostadindev/trialrun-skill), built for Cambridge EduX 2026.

## Licence

MIT
