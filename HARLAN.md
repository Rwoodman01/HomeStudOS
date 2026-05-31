# Harlan

## Mission

Kill the Drift.

## Core Promise

Nothing important gets dropped.

## Role

Harlan is the continuity layer for HomeStud OS.

He remembers commitments, open loops, waiting-ons, follow-ups, captures, escalations, and priorities so Bobby does not have to carry everything in his head.

## Flow

Capture -> Harlan -> Dispatch -> Action

## Harlan Owns

- Open loops
- Waiting ons
- Follow-ups
- Escalations
- Priorities
- Dispatch generation

## Harlan Does Not Do

- Send emails automatically
- Replace Claude for writing
- Replace Gemini for research
- Build autonomous agent chaos

## System Principle

Use logic first.
Use AI only where judgment is needed.

1926 discipline. 2026 tools.

## Operational Memory

Firebase stores active state:

- actions
- captures
- waitingOns
- projects
- assets
- decisions

## Knowledge Memory

Obsidian stores durable knowledge:

- research
- frameworks
- lessons
- prompts
- decisions
- book notes
- useful AI outputs

## Dispatch Shape

- Urgent
- Top 5
- Waiting On
- Captures to Review
- Looking Ahead

## Rule

Every important item must end as:

- Completed
- Deferred
- Delegated
- Archived
- Abandoned intentionally

No silent disappearing.

## Intelligence Loop

Harlan should always get smarter, but not by pretending to be fully autonomous.

Use Firebase for operational memory:

- What is open right now
- What is waiting
- What was completed
- What was deferred, delegated, archived, or abandoned
- Which captures became actions, waiting-ons, assets, decisions, or archives
- Which priorities Bobby accepted or changed

Use Obsidian for durable learning:

- Patterns that repeat
- Better prompts
- Decision history
- Project context
- Lessons from completed work
- Useful AI outputs
- Frameworks Bobby wants reused

The learning loop is:

Capture -> Harlan proposal -> Bobby review -> Firebase state update -> Obsidian durable note when useful -> Better future proposals

Harlan should learn from corrections:

- If Bobby changes a proposed project, remember the pattern.
- If Bobby changes an action to a waiting-on, improve waiting-on detection.
- If Bobby archives similar captures repeatedly, treat similar future captures as lower signal.
- If Bobby promotes certain work to urgent or Top 5, learn what urgency means in context.
- If a decision or asset is exported to Obsidian, treat it as durable context for later work.

AI should be used for judgment, synthesis, classification, and pattern recognition.
Logic should be used for state, rules, recurrence, counts, dates, and dispatch assembly.

## Next Product Direction

Build Gmail as an inbox capture source, not an autonomous email agent.

The first Gmail version should:

- Import selected emails or threads into captures.
- Let Bobby mark an email as an action, waiting-on, asset, decision, or archive.
- Detect likely follow-ups and waiting-ons for review.
- Store Gmail metadata on the capture or action, including thread id, sender, subject, received date, and permalink when available.
- Never send replies automatically.

The useful workflow is:

Gmail thread -> Harlan capture -> Review -> Action or Waiting On -> Dispatch

Start with read-only Gmail sync. Add draft generation later only as a reviewed handoff to Claude or a manual compose flow.

For automatic sync, use a server-side OAuth flow with refresh tokens. Browser-only Google sign-in is not enough for twice-daily background runs.

Night debrief time is user-selectable in Settings. Default is 8:30 PM America/Halifax.

Background sync should check every 30 minutes and run the night debrief only when the user's selected debrief time matches the current local time:

- Refresh Google access server-side.
- Import recent Gmail threads as captures.
- Import upcoming Calendar events as captures or Looking Ahead context.
- Deduplicate by Gmail thread id and Calendar event id.
- Queue imported items for Harlan review.

Settings should also include a manual Run Debrief Now button. Use it to test the Gmail and Calendar pipeline immediately before relying on the scheduled night debrief.

Review should be source-aware:

- Gmail captures should show subject, sender, date, and snippet.
- Calendar captures should show title, time, location, and description context.
- Source badges should make Gmail, Calendar, voice, photo, and text captures easy to scan.
- Harlan should classify source captures by next move, not by source alone.

Calendar belongs in the same Settings integrations area.

The first Calendar version should:

- Request read-only calendar access.
- Pull upcoming events into Looking Ahead.
- Detect commitments that need prep, follow-up, or travel buffers.
- Never create, edit, or delete calendar events automatically.

The useful workflow is:

Calendar event -> Looking Ahead context -> Harlan capture when action is needed -> Dispatch
