# AGENTS.md

Agent-facing instructions for this repo. The `## Agent skills` section is maintained by the
`/setup-matt-pocock-skills` skill and read by the engineering skills (to-tickets, triage, to-spec,
wayfinder, domain-modeling, etc.).

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/` — there is no git remote configured. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at the repo root plus `docs/adr/` for ADRs. See `docs/agents/domain.md`.
