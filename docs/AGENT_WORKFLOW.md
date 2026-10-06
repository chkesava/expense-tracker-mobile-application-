# Agent Workflow (shared by Claude Code and Codex)

This file is the **single source of truth** for how any coding agent works in this repository: Claude Code, Codex, or anything else.

- `AGENTS.md` (Codex) and `CLAUDE.md` (Claude Code) both point here.
- The user maintains this file. If an agent's private memory or notes disagree with it, **this file wins**.
- Agents must re-read it at the start of every task.
- Agents must not edit it unless the user asks.

---

## 1. Read first, every task
1. This file.
2. `.claude/spendly_epic_execution_roadmap.md`: the long-term epic roadmap. It is **context only**: it is not a work order, it stays untracked, and agents never edit or commit it.
3. The active epic's tracker in `docs/`, for example `docs/SPENDLY-186-merchant-intelligence.md`, and its plan, for example `docs/SPENDLY-186-plan.md`.
4. `git log --oneline -15` on the epic branch, plus the Jira ticket, to see what is actually done. Trust the repo and Jira over any status table.
5. For any **Ganesh Seva UI** work, also follow `CLAUDE.md` in full.

## 2. Scope discipline
- Implement **only the story the user assigned**.
- **Placement:** use the roadmap to place the task.
- **Dependencies:** before coding, check the existing code, the dependencies and whether they're ready (in the repo and in Jira), and work out the smallest correct scope.
- **Missing dependencies:**
  - Say exactly which dependency is missing.
  - Name the minimum contract it would need.
  - **Never build a parallel or duplicate version** of a dependency: no second calendar, notification system or ledger.
- **Drift:** report meaningful differences between the roadmap, Jira and the repo. Update the roadmap only when asked.

## 3. Branching and story workflow (strict)
**Branches:**
- `main` → **epic branch** → **one branch per story**, each cut from the epic branch.
- Story branches are named `feature/SPENDLY-<story>-<slug>`.
- Epic branches are named after the epic key, e.g. `feature/SPENDLY-186-merchant-intelligence`.
- An existing epic keeps its current branch name.

**Each story, in order:**
1. Move the Jira story to **In Progress**.
2. Cut its branch from the epic branch.
3. Implement and test it.
4. Commit. The message includes the key, e.g. `feat(SPENDLY-189): …`.
5. Add a Jira comment listing what was done, the commit, the tests and the docs.
6. **STOP and ask the user before merging** the story into the epic branch. Merge with `git merge --no-ff`.
7. After the merge, **ask again before starting the next story**.

**Approvals:**
- Never chain stories on your own, even when a prompt says "continue story by story".
- "yes merge it and pick next ticket" approves both steps: the merge and the start of the next story.

**Epic to main:**
- The epic merges to `main` only when every story is done **and** the user asks.
- Draft PRs from the epic branch are fine when requested.

**Docs:** each story gets `docs/SPENDLY-<story>-<slug>.md`, and the epic tracker table is updated on every story commit and merge.

## 4. Jira
- **Project and site:**
  - Project `SPENDLY`; use `KAN` only for Ganesh Seva work.
  - Site `kesavach.atlassian.net`, cloudId `99e5a4a4-9c8e-4f47-b8ce-22ecf439fa8f`.
  - Use `maxResults: 10` on searches.
- **Transitions:** `21` = In Progress, `31` = Done.
- **Done rule:** a ticket moves to **Done only when its changes reach `main`**, never on an epic-branch merge. When it does, comment with the merge commit, the doc, and anything left over (and which ticket carries it).
- **Issue links:** they can't be deleted through the API. Ask the user to remove stale links by hand.
- **Merge comments:** after an epic-branch merge, comment on the story and keep it In Progress.

## 5. Validation (every story)
```
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit        # slow, allow ~10 min
npm run test:rules                       # whenever firestore.rules or a rules test changes (needs port 8080 free)
git diff --stat <epic-branch>            # confirm nothing outside the story's scope changed
```
Report failures honestly, with their output. Never skip hooks.

## 6. Code conventions (Spendly)
- **Stack:** Expo Router and React Native (read the Expo v57 docs; see `AGENTS.md`), NativeWind, Gluestack wrappers in `components/ui` and `components/common`, FlashList, lucide icons, and theme tokens (`useTheme`, `useSurfaces`, `withAlpha`).
- **Pure logic:**
  - goes in `shared/utils` and `shared/data`, with vitest tests next to it;
  - `shared/` stays free of React Native imports.
- **Firestore:**
  - User data lives at `users/{uid}/...`.
  - Writes go through `commitMutations` (the offline outbox) plus `writeSavedMessage`.
  - Listeners use `useLoadFailure`, `snapshotErrorHandler` and `forgetSnapshotPath`.
  - **Firebase Efficiency (SPENDLY-406 Standard):** Use on-time render and no pre-fetch. Do not mount collection listeners unconditionally at the top of a screen if the data is only used in a modal, bottom sheet, or sub-view. Only mount the listener (triggering the Firebase read) when the specific UI component requiring the data is rendered.
- **Firestore rules:**
  - A new collection gets a strict validated rule: `isOwner`, `hasOnly`/`hasAll`, and pinned `createdAtMs`. Keep it out of the catch-all list.
  - Back it with emulator tests (`firestore/*.rules.test.ts`) and TS↔rules contract tests.
- **New routes:** add an `as Href` cast and register the route in all three places, with tests:
  - the `app/(app)/_layout.tsx` Stack.Screen;
  - `SUB_SCREEN_PREFIXES`/`SUB_SCREEN_ROUTES` in `shared/config/navigation.ts`;
  - `RESTORABLE_ROUTES`.
- **User-facing errors and logging** go through `lib/errors.ts`.
- **Multi-app safety:** Expense, Nutrition and Ganesh Seva share this repo. Keep each change inside its product.

## 7. Safety
- **Shared Firebase:** one Firebase project (`expenseapp-27f94`) serves both dev and prod, and there is **no staging**.
  - Never run a migration, backfill or data-mutating script without a dry-run report and the user's explicit go-ahead.
  - A `firebase deploy` of rules or indexes is a production change. The indexes file is a subset of live, so diff before any index deploy.
- **Device QA:**
  - Use **Spendly Test** on the Firebase emulator (`docs/LOCAL_TEST_MODE.md`), never the real app against production.
  - Before changing phone display settings, record `wm size`, `wm density`, the nav mode and the theme, then restore those exact values afterwards. Never use `reset`.
- **Android:** `npx expo prebuild` regenerates `android/` and wipes the release signing. Back up and restore `build.gradle` and `gradle.properties`.
- **After merge to main:** follow `docs/AFTER_MERGE_CHECKLIST.md` for rules deploy, Netlify and Android leftovers.
- **Audits:** log every finding in `docs/` with a full explanation and a P0–P3 rank, not just in chat.

## 8. Handoff between agents
Before ending a session, or when the user switches agents:
1. Commit all finished work. Never leave a story half-staged.
2. Update the epic tracker's **State** column and add any new decisions to its Decisions section.
3. Comment on the Jira story with the current state.

The next agent starts with section 1. No conversation history is needed.
