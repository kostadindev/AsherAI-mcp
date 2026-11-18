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

Tuned for few false positives, not completeness. Names on their own aren't detected (add them as terms);
non-UK identity numbers, addresses without a UK postcode and unlabelled secrets are missed.

## Limitations

- Text files only. PDFs and Office files are refused; export them to text or CSV.
- The gateway sees only what goes through it. Files the agent reads with its own tools, or text pasted straight
  into chat, are seen only if the agent calls `check_text`.
- Habit moments are logged by the AI. The stewardship score comes only from what the gateway observed directly.

## Development

```bash
npm install
npm test        # builds, then: 52 detector cases, scenario smoke test, workspace smoke test
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
