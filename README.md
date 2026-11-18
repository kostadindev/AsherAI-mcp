# trialrun-mcp

An MCP gateway that assesses **data stewardship** and **AI-literacy habits** while any MCP agent works on your
files. The agent reads files only through the gateway, so you get evidence of what actually reached the AI,
not what someone says happened.

- Every file the agent opens is **logged** with a timestamp.
- Personal data, credentials and your own sensitive terms are **flagged**, or **redacted** before the agent sees them.
- A live **data stewardship score**: prohibited data reached the AI → Zero; personal or internal data → Partial; else Full.
- A **habit log** and **AI literacy report** that a coaching skill can write to
  ([trialrun-skill](https://github.com/kostadindev/trialrun-skill)).
- Logs, replies and reports hold **labels only** (for example "NI number"), never raw values.

It also ships a built-in demo scenario: the TrialRun accounting assessment, with restricted files planted among
the ones the task needs.

## Quickstart

Claude Code, on a folder you want to work on:

```bash
claude mcp add trialrun -e TRIALRUN_WORKSPACE=/path/to/folder -- npx -y github:kostadindev/trialrun-mcp
```

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

Globs support `*`, `**` and `?`; a pattern with no `/` matches the file name at any depth. The policy file, the
session log (`.trialrun-session.json`) and all dotfiles are never served.

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
| 1, prohibited | Labelled credentials, AWS / `sk-` / GitHub keys, private keys, Luhn-valid card numbers, passport numbers next to "passport", your cat1 terms |
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

`npm run eval` scores the detectors against labelled corpora of fictional accounting documents (payroll,
bank exports, invoices, loan agreements, emails, configs, audit working papers). A hit counts when its label
matches and its span overlaps a labelled span.

| Corpus | Documents | Labelled items | Precision | Recall |
|---|---|---|---|---|
| Tuning (`test/corpus`), used while developing | 40 | 77 | 100% | 100% |
| Held-out v1 (`test/corpus-heldout-v1`), misses fixed, now a regression set | 10 | 28 | 100% | 100% |
| Held-out v2 (`test/corpus-heldout-v2`), misses fixed, now a regression set | 12 | 22 | 100% | 100% |
| Held-out v3 (`test/corpus-heldout-v3`), written after those fixes, never tuned on | 12 | 30 | 96.0% | 80.0% |

The tuning corpus gates the run (precision and recall at least 95%, and at least 90% recall for every label
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
npm test        # builds, then: 52 detector cases, scenario smoke test, workspace smoke test
npm run eval    # precision and recall on the tuning corpus and held-out v1, v2, v3
npm run corpus  # regenerate the corpora from test/corpus*-src.ts
```

| Variable | Default | Meaning |
|---|---|---|
| `TRIALRUN_WORKSPACE` | unset | Real folder; switches to workspace mode |
| `TRIALRUN_STATE` | `<workspace>/.trialrun-session.json` or `./trialrun-session.json` | Session log |
| `TRIALRUN_MODE` | `monitor` | `monitor` or `enforce` (the policy file's `mode` wins) |
| `TRIALRUN_ROLE` | `student` | `student` or `assessor` |

Part of [TrialRun](https://github.com/kostadindev/trialrun-skill), built for Cambridge EduX 2026.

## Licence

MIT
