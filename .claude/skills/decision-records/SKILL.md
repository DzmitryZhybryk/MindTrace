---
name: decision-records
description: Use when the owner has just settled a choice between defensible alternatives, when a plan or a task file under .plan/ is finished and about to be deleted, when an entry under .claude/decisions/ is being changed or reversed, or when a decision turns up stored in auto-memory.
---

# Decision records

A record stops a later session from re-proposing an option the owner already rejected, or from
undoing a deliberate choice without knowing it was one. Claude is the only reader, so records are
English and terse. The reader has the code open: a record holds only what the code cannot say —
why, and what lost.

## Layout

- `.claude/decisions/<area>.md` — one file per area, a domain or a cross-cutting subsystem. It holds
  every live decision of that area.
- `.claude/rules/common/decisions.md` — the index, loaded into every session: one row per file,
  listing the questions the file answers.
- A file states the current truth. Its history is `git log -p` on the file.

## Does it earn a record

Only the most important decisions get an entry: every entry costs context in each session that
reads its file. Write one when both hold:

- the decision shapes more than the code that implements it — a boundary between domains, a
  contract (HTTP, data, messages), the data model, or a policy that applies across the project;
- a later session could plausibly undo it, or propose the option that lost.

Everything else gets no entry:

- how one function, query or screen works — that is design, and the code is its record;
- a consequence of another entry — it is a bullet inside that entry;
- a review finding left unfixed, naming, formatting, bug fixes;
- conventions — they live in `.claude/rules/`;
- limitations that already have a task file under `.plan/` — the task holds them until it closes.

## The owner approves every new entry

A new entry is written only after the owner has said yes to it. Propose candidates first, in one
message, one line each: the heading, plus which part of the bar it meets. Write the ones approved
and drop the ones declined.

This holds when an entry looks obviously important, when it comes from a plan the owner already
confirmed, and when many candidates arrive at once. The bar filters candidates; only the owner
decides what is kept.

## Shape of an entry

```markdown
## <the decision, as a present-tense statement>
- Why: <the reason, one or two sentences>
- Rejected: <option> — <why it lost>
- Revisit when: <observable condition>
- Source: PR #N, <YYYY-MM-DD of the decision>
```

- `Rejected` is required, one line per option. Nothing to put there means the item is a convention
  or a fact, not a decision, and it gets no entry.
- `Revisit when` appears only when such a condition exists.
- A reason the source does not state is written `why not recorded`. A reconstructed reason reads
  as authoritative later, which is worse than a visible gap.
- Anchors are names grep finds: modules, classes, error codes, routes. `file:line`, logs,
  measurements and the discussion itself stay in the PR.

## Changing a decision

Rewrite the entry in place so it states the new decision. The old one becomes a `Rejected` line of
the new entry, dated when it was dropped: `Rejected: 404 (until 2026-10-12) — <why it lost>`.
Entries carry no status, number or supersede link. A decision dropped with no successor is
deleted; an area file left empty is deleted together with its index row.

## When

- In the change that implements the decision, so the entry lands in the feature's commit.
- When a plan under `.plan/` is finished, before the plan is deleted: walk its
  requirements, owner decisions, open concerns and progress log, and carry over every item that
  earns a record. Phases, file lists, gates and risks are not carried.
- When a task file under `.plan/` closes and its text names rejected alternatives.
- When a decision turns up in auto-memory: it moves here (if it earns a record) and leaves memory.

## Area files and the index

- Prefer an existing area. A new area file and its index row are written in the same edit.
- An index row lists questions, not answers: "who stores email and username", not "auth stores
  them". A question stays true when its answer changes, so the row does not drift from the file.
- A file that is slow to scan is carrying non-decisions: implementation detail, history,
  explanations of the code. Prune those; do not split the area.

## Before saving

- Every new entry was approved by the owner in this session.
- Every entry passes both conditions of the bar; an entry that only describes how something works
  is deleted, and one that follows from another entry is folded into it.
- Every entry has a `Rejected` line, and every unstated reason says `why not recorded`.
- No `file:line`, no logs, no numbers from a single run.
- Every entry heading is covered by a question in the file's index row.
