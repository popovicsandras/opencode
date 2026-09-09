# Working agreement for this folder

This prototype is built incrementally across many sessions. Each session
introduces new feature requests on top of what already exists. These rules
govern how that work gets documented. They are not optional.

(Repo-wide code conventions are in the repo-root [AGENTS.md](../AGENTS.md).
This file is about documentation only.)

## Document structure

Three governing documents, **all three index files only**:

- [intent.md](intent.md) — product intent: why, who, what, how it should feel.
- [architecture.md](architecture.md) — technical: what exists, what was tried
  and rejected, gotchas, open decisions.
- [DEVIATION-FROM-CORE.md](DEVIATION-FROM-CORE.md) — the authoritative,
  maintained list of every upstream/core file this fork touches, and why. This
  is the one document a rebase depends on being complete; the other two
  explain *why*/*how* a feature exists, this one enumerates, literally and
  completely, what touching it cost upstream. See "When you touch a core
  file" below — it has its own trigger, separate from the intent/architecture
  one.

None of the three is allowed to grow into a several-thousand-line monolith.
The actual content lives in one document per feature, **per category**:

```
intent.md                     index: framing + one paragraph per feature
architecture.md               index: pointers + headline per feature
DEVIATION-FROM-CORE.md         index: pointers + headline per feature
intent/
  foundations.md              project-level: why, who, feel, not doing
  <feature>.md                one per feature
architecture/
  foundations.md              constraints, package layout, upstream touches
  verification.md             how to run and prove things work
  <feature>.md                one per feature
deviations/
  foundations.md              cross-cutting: how the touched surface stays
                               small, generic rebase-checklist items
  <feature>.md                one per feature: touched-files table, security
                               notes if any, feature-specific rebase notes
```

**A given `<feature>.md` filename can now exist three times** — once under
each of `intent/`, `architecture/`, and `deviations/` — always with the exact
same slug. `element-picker.md` under `intent/` is that feature's product
framing; the file with the *same name* under `architecture/` is its technical
account; the file with the *same name* again under `deviations/` is its
upstream-touch ledger. They are different documents that happen to share a
filename by design — do not assume a link to "`element-picker.md`" is
unambiguous without its parent folder, and always disambiguate by folder when
talking about one, in prose or in a link.

Rules for the structure:

- **Same slug in all three categories.** A feature named `element-picker` has
  exactly `intent/element-picker.md`, `architecture/element-picker.md`, and
  `deviations/element-picker.md`. Kebab-case. If a feature genuinely touches
  no upstream files, its `deviations/<feature>.md` still exists and says so
  explicitly — it is not omitted.
- **Every feature appears in all three indexes**, in the feature table and as
  a short entry. Each index's feature table now has a column pointing at each
  of the other two categories' document for that feature, so an agent landing
  on any one index can reach everything.
- **Indexes carry framing and pointers, never detail.** If you are adding more
  than a short paragraph to an index, it belongs in a feature document.
- **Feature documents are self-contained enough to work from.** Someone picking
  up one feature should be able to read foundations plus that one document and
  start. Link across to other features (and across categories — a
  `deviations/<feature>.md` linking to its `architecture/<feature>.md` for the
  *why*, say) rather than duplicating them.
- **Cross-cutting material goes in the category's `foundations.md`** (or
  `architecture/verification.md`), not smeared across feature documents.
- Each feature document opens with a **status** line and links to its
  counterparts in the other two categories, and ends with its own
  **open questions / open decisions** (`deviations/<feature>.md` instead ends
  with **rebase notes**, feature-specific ones only — generic ones live in
  `deviations/foundations.md`). Project-level questions belong in that
  category's `foundations.md` instead.

## When documents get updated

Two triggers, both mandatory, for the `intent`/`architecture` pair — the
`deviations` category has its own trigger, in "When you touch a core file"
below, because it fires on a different condition (touching a core file, not
agreeing/shipping a feature) and can apply even when neither of these two do:

**1. When a feature is agreed and planned.** Create
`intent/<feature>.md` and `architecture/<feature>.md`, and add the feature to
both index tables with a status of `Planned`. Record the intent and the plan,
including the alternatives already ruled out during the discussion.

**2. When that feature is implemented.** Update both documents to reflect what
was actually built — status, what exists, gotchas discovered, decisions closed,
new open questions raised. **This happens in the same session as the
implementation.** It is not deferrable to "later".

**Updating a feature document is not enough on its own — the matching index
entry must change too, in the same pass.** It is easy to write a thorough
`intent/<feature>.md` / `architecture/<feature>.md` update, consider the
documentation done, and forget that `intent.md` and `architecture.md` each
still carry their own paragraph/headline for that feature (see "Every feature
appears in all three indexes" above). Before moving on, re-read the feature's
paragraph in `intent.md` and its headline in `architecture.md` and ask: does
this still describe what the feature does after this change? If a feature
document changed, treat updating its two index entries as part of the same
edit, not a separate follow-up step — check it explicitly, every time, even
for a change that feels small.

Further guidance:

- `intent.md` / `intent/` changes when the feature changes what the product
  does, who it is for, or how it should feel.
- `architecture.md` / `architecture/` changes when the feature changes what
  exists, adds a technical decision, closes or raises an open question, or
  produces a finding worth recording for whoever picks this up next.
- Record what was **rejected** and why, not just what was built. The rejected
  alternatives are the most valuable part of these documents on a re-read.
- A change can require updates to both sides, one, or (rarely) neither — if
  truly neither applies, say so explicitly rather than silently skipping it.
- Do not wait to be asked. Treat "we agreed on it" and "it is implemented" as
  the triggers, not a reminder.

Keep the documents honest: agreed-but-not-yet-implemented is not done, and
implemented-but-undocumented is not done either.

## When you touch a core file

A "core"/"upstream" file is anything outside the fork-owned packages (today:
`packages/designer-browser`, plus this documentation folder) — most often
something under `packages/desktop`, `packages/app`, `packages/session-ui`, or
`packages/ui`. **Any commit that adds, edits, or removes such a file — even
one line, even a translation string — updates that feature's
`deviations/<feature>.md` in the same session** (and, if the file is new
enough to that feature to need one, its row in `DEVIATION-FROM-CORE.md`'s
feature table — see "Every feature appears in all three indexes" above). This
is a separate trigger from the intent/architecture one above and fires even
when neither of those two indexes changes (e.g. a one-line prop addition with
no product- or architecture-level consequence still needs a row in the
relevant `deviations/<feature>.md`'s touched-files table).

If the touch doesn't obviously belong to one existing feature (rare — most
upstream touches exist *because* of a specific feature), it still needs a
home: pick the feature it most directly serves, or, if it's genuinely
cross-cutting, put it in `deviations/foundations.md` instead of leaving it
undocumented.

Concretely, for each core file you touched:

- If it's a new touch point for that feature, add a row to
  `deviations/<feature>.md`'s table: the file, why it needed to change, and
  which fork-owned file/feature owns the logic driving the change.
- If it's a file already in that table, extend that row's reason rather than
  leaving it describing only the old behavior. If the same file is *also*
  touched for a different reason belonging to a different feature, that's a
  separate row in that other feature's `deviations/<feature>.md` — don't
  merge unrelated reasons into one row just because they share a file.
- If the change plausibly affects the rebase checklist (a new event contract,
  a new IPC channel, a new dependency between packages, a new place that
  reaches into upstream internals), add or update that feature's own rebase
  notes, or `deviations/foundations.md`'s generic checklist if it isn't
  feature-specific.
- If a change makes an existing table row or checklist entry obsolete (a
  revert, a superseding refactor), remove or correct it — a stale deviation
  entry is as bad as a missing one, since a rebase will "fix" a conflict that
  no longer needs fixing.
- If this is the feature's first upstream touch, it needs a
  `deviations/<feature>.md` file at all (see "Same slug in all three
  categories" above) plus a new row in `DEVIATION-FROM-CORE.md`'s feature
  table and a short entry below it, mirroring how `intent.md`/`architecture.md`
  already gain a row and entry when a feature is first created.

Forgetting this is the same failure mode as forgetting an intent/architecture
index update (see above): the work is real and correct, but the one document
a future rebase actually depends on silently drifts from the code. Do not
wait to be asked, and do not treat "I already updated the architecture doc"
as covering this — `architecture/<feature>.md` explains *why*,
`deviations/<feature>.md` is the *complete, literal list*, and only you,
right after making the change, know for certain whether that list is still
complete.
