# Page titles rename — design

**Date:** 2026-06-12
**Status:** approved (brainstormed in chat)

## Goal

Replace working titles with direct descriptions of what each page shows.
Convention: **nav label names the content** (sentence case for multi-word),
**hint carries the use**, **page H1 restates the content as a sentence**.
No jargon ("status", "scan"), no catchy names ("where the gap lives").

## The approved set

| Page | Old label | New label | New hint | H1 |
|---|---|---|---|---|
| landing | Overview | **Home** | Start here · add your data | unchanged (hero) |
| report | District Report | **Statewide comparison** | Your schools vs. the state | keep "How your schools compare statewide" |
| scan | System Scan | **Growth by school & grade** | Where to look first *(the old H1, demoted)* | "How every grade at every school is growing" |
| achievement | Status & Growth | **Scores vs. growth** | Both measures, every school | "How each school scores — and how fast it grows" |
| demographics | Demographics | **Growth by student group** | Every group, district-wide | keep "How growth varies from group to group" |
| gap | Gap Analysis | **Group gaps by school** | Two groups, school by school | "The gap between two groups, at every school" |
| exportpg | Export | Export | Board-ready PowerPoint | keep |
| resources | Resources | Resources | Evidence for next steps (keep) | keep |

The demographics/gap hints are deliberately parallel ("Every group,
district-wide" / "Two groups, school by school") — those two pages are the
confusable pair, and the hints carry the distinction.

## Ripples swept in the same pass

- Page eyebrows (BriefHeader) match the new nav labels.
- Cross-references in body copy: scan blurb → "Group gaps by school",
  demographics blurb link, landing cards/CTAs and the both-loaded banner.
- Export deck: slide titles/notes that referenced "System Scan" now say
  school & grade; the deck cover keeps **"District Report"** — that names
  the artifact, not a page.
- methods.html section headings and in-text page references.
- README page list rewritten to the real eight-page nav (it still described
  a separate Upload page and lacked Statewide comparison / Resources).
- Stale code comments that referenced old page names.
- `document.title` follows PAGES automatically.

## Out of scope

Figure-card titles (e.g. "How each grade is doing, school by school") —
already content-descriptive; historical specs/plans/reviews keep old names.
