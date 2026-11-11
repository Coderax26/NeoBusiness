# Phase P5 — Documentation and Governance

## Objective

Create one reliable project truth so implementation status, blueprint requirements, test evidence, ownership, and release scope do not contradict each other.

## Current documentation problems

- `docs/claude/*` checklists remain unchecked even where backend implementation exists.
- `docs/PROJECT_OVERVIEW.txt` marks M7b pending although M7b backend files exist.
- `docs/IMPLEMENTATION_ROADMAP.md` contains stale M2/M7b pending statements.
- `docs/CHANGELOG.md` contains historical status claims that do not reflect current parallel test failures.
- `m7-control-tower` is empty while M7a/M7b are implemented separately.
- Repository instructions refer to a root `CHANGELOG.md`, but the current authoritative file is under `docs/`.

## Workstream P5.1 — Authoritative status model

Create a single status table with:

- module/phase
- backend implementation status
- API status
- frontend status
- test status
- integration status
- production-readiness status
- owner
- target release
- blocking dependencies
- evidence links

Use explicit states:

- Not started
- In progress
- Backend complete
- Product complete
- Verified
- Blocked
- Deferred
- Released

## Workstream P5.2 — Blueprint traceability

For every checklist item in `docs/claude`:

1. Assign a unique requirement ID.
2. Link it to source files, migrations, routes, events, tests, and UI screens.
3. Mark evidence status.
4. Record gaps and owner.
5. Link decisions that affect interpretation.

Do not mark an item complete from service code alone when the blueprint requires API, UI, offline, audit, or acceptance evidence.

## Workstream P5.3 — Roadmap and changelog reconciliation

- Update roadmap milestones to reflect actual implemented modules.
- Move completed M2/M7b items out of pending sections.
- Add the current test baseline and known failures.
- Record deferred items with release target and reason.
- Keep changelog entries factual and versioned.
- Link the phase plans in this folder from the project overview.

## Workstream P5.4 — Ownership and delivery governance

For each remaining task, record:

- accountable owner
- implementer
- reviewer
- target milestone
- dependency
- acceptance evidence
- rollback or deferral decision

Create a release checklist covering:

- code review
- migrations
- tests
- security
- observability
- backup/restore
- user acceptance
- deployment
- rollback
- support handover

## Workstream P5.5 — Module naming and repository structure

Decide and document whether:

- `m7-control-tower` remains a future umbrella,
- M7a/M7b are the official implementation modules,
- or the empty directory is removed/renamed.

Ensure module names in code, docs, migrations, changelog, and dashboards use one convention.

## Exit criteria

- A new contributor can identify the real project status from one entry point.
- Every remaining task has an owner, priority, dependency, and evidence requirement.
- Blueprint, roadmap, changelog, overview, and traceability documents agree.
- Release decisions and accepted deferrals are auditable.
