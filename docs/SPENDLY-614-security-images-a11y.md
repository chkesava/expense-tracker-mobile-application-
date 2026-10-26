# SPENDLY-614: Security, goal images, biometric lock and accessibility

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`.

## Security (FRD FR-14)
The rules for goals, events and name locks were built and tested from 608 to 613. This story adds image metadata and the lock, and extends the adversarial suite.

| AC | Evidence (`firestore/saveGoals.rules.test.ts`, 41 tests) |
|---|---|
| No other user can read, create, update or delete a goal, its history or its name lock | "isolation", and history/achievement queries refused for another user |
| No client can forge summary amounts or alter audit records outside the correction flow | Forged amount with no event; event delta ≠ summary change; stand-alone event carrying money; milestone event carrying money; event update/delete refused; reversal under a non-derived id; correction of a non-amount event |
| Invalid transitions and values are refused | Completing below target, wrong unarchive target, stale literal version, closed-goal contributions, negative balance, bad status, unknown fields |
| **New:** image metadata is this user's image for this goal | Other user's or goal's path, an account document path, path traversal, PDF type, over 10 MB, zero width, extra keys and a non-map value are all refused; removal (null) is allowed |
| **New:** the lock is a boolean setting | Non-boolean refused; it never moves `version` or money |

Contract test: `goalImageOk`'s keys, types and limits match the client (`goalModel.rules.contract.test.ts`).

**Account deletion:** `delete-account` recursively deletes every user subcollection (goals, events, name locks) and purges the read-model tables (609). **It does not delete stored files**; see "Limitations".

## Images (FRD FR-12)
- **Storage:** the existing private `spendly-files` bucket, through the **`spendly-files` Edge Function** (`supabase/functions/spendly-files/handler.ts`).
  - It now accepts `users/{uid}/goals/{goalId}/{imageId}/{file}`, proves ownership by reading `users/{uid}/financialGoals/{goalId}` **as the caller**, and accepts only JPEG/PNG/WebP for goal paths (415 otherwise; 413 over 10 MB).
  - 4 new handler tests: path parsing, ownership read, foreign or missing goal refused, wrong type or size refused, delete.
- **Client:** `services/goals/goalImageStore.ts` and `shared/utils/goalImage.ts` (pure, tested).
  - Pick from the library or take a photo (camera hidden on web). Camera and photo permissions are requested, with a clear message when denied.
  - The source type is validated (JPEG/PNG/WebP/HEIC) and the image must be at least 64 px.
  - Every image is normalised to a **JPEG with the longest edge ≤ 1600 px at quality 0.8** (expo-image-manipulator), then checked against the 10 MB limit.
  - Upload uses the existing `spendlyFilesClient` (signed upload URL; the bytes never pass through the function).
- **Replacement is safe:**
  1. Upload the new object.
  2. Save the metadata on the goal (a settings write; rules check the path).
  3. **Only then** delete the old object.

  If step 2 fails, the new object is deleted again, so the old photo stays and no orphan is left. Cleanup failures are logged.
- **UI:** `components/goals/GoalPhotoSection.tsx` on the goal page.
  - Upload stages are shown and announced ("Preparing…", "Uploading…", "Saving…").
  - **Retry upload** reuses the prepared photo, so there's no need to pick again.
  - Replace and Remove are available.
  - The photo is shown with **expo-image, cached by storage path**, so the 5-minute signed URLs don't force re-downloads.
  - Cards keep the icon; one signed URL per card would cost a function call each.

## Per-goal lock (FRD FR-14)
- **`hooks/useDeviceAuth.ts`:** the device's own screen lock (biometrics **or passcode**) via `expo-local-authentication`. This is separate from the Vault's biometric enrolment, which is unchanged.
- **Turning it on or off** requires the device lock, so whoever is holding the phone can't remove it. It is stored as the goal's `locked` setting.
- **`lib/goalLockSession.ts`:** unlocks are per goal, for the session, and **forgotten when the app leaves the foreground**.
- **While locked:**
  - The goal page shows only `GoalLockPanel`.
  - Cards, the Dashboard widget, the Money section list and the analytics per-goal row show "Locked" instead of amounts.
  - Analytics *totals* still include the goal.
- **Fails closed, for that goal only:** a failed or cancelled check, or a device with no screen lock (including web), keeps that goal hidden with an explanation. **The rest of the app is never locked.**
- **What the lock is not:** a privacy screen on the device. It is not data security; the data is protected by sign-in and Firestore rules like every other record.

## Accessibility (FRD FR-15): audit of the goal UI
| Check | Status |
|---|---|
| Screen-reader labels | Every goal card, timeline row, milestone row, chart alternative, tile and icon-only button has a label. **Static test:** every `size="icon"` button in the goal UI has `accessibilityLabel` (`saveGoals.qa.test.ts`) |
| Roles | Tabs (`tablist`/`tab`), radio groups for chips (icons, reasons, sorts, frequencies), `alert` for unsaved changes, `summary` for chart text |
| Live regions | Validation errors, sync state, upload stages, lock results, "target reached" and the unsaved-change banner |
| Charts | The bar chart is hidden from screen readers and replaced by `analyticsSummaryText` |
| Reduced motion | Goal celebrations use a still card when reduced motion is on (610) |
| Touch targets | Shared `Button`/`Chip` components; icon tiles ≥ 48 dp; reorder and fix actions are buttons, not gestures |
| Font scaling | Text uses theme sizes with no fixed-height text containers; rows wrap (`flexWrap`) |
| Contrast | Theme tokens only (no hard-coded colours) |
| **Not verified** | TalkBack/VoiceOver and large-font runs on a device: **pending device QA** |

## Tests run
See the Jira comment for this commit.

## Production steps (after merge, each with approval)
1. Deploy the `spendly-files` Edge Function (goal paths).
2. Deploy the Firestore rules (`goalImageOk`).

There are no bucket changes. Runbook: `docs/SPENDLY_DOCUMENTS_STORAGE.md` → "Save Goals images".

## Limitations
- **No orphan sweeper**, as for account documents. An object whose cleanup failed stays unreferenced.
- **Account deletion doesn't remove stored files: a confirmed, existing gap.**
  - `netlify/functions/delete-account.ts` erases Firestore and the read model, but has **no `spendly-files` storage phase**.
  - So a deleted account's **account documents (SPENDLY-88) and goal photos** stay in the private bucket. They can't be reached through the app, but they are kept.
  - This predates Save Goals. It needs its own ticket: a storage phase that removes `users/{uid}/` (and the duress prefix) through the service role.
- **Upload progress is staged**, not a byte percentage: the signed-URL upload API doesn't report bytes.
