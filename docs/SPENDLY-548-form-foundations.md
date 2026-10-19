# SPENDLY-548 (Phase 6a): Form foundations

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-548-form-foundations`, cut from the epic branch (`1740b12`).

This is UI only, with no write paths, data or rules changes. The date field part of the original ticket moved to SPENDLY-557, which is done.

## 1. `Input` labels in the theme font
**Cause:** the Gluestack form-control text styles use `font-body`, which is `var(--font-sans)`. Nothing defines that variable.
- On web, labels, helper text and errors fell back to the browser default serif (computed: `"Times New Roman"`).
- On native, they fell back to the system font, never the theme font.

**Fix:** `components/ui/Input.tsx` passes the theme font explicitly. A caller's `style` still overrides it.
| Text | Font |
|---|---|
| Label | `theme.fontFamily.medium` |
| Field | `theme.fontFamily.regular` |
| Helper | `theme.fontFamily.regular` |
| Error | `theme.fontFamily.medium` |

**Multi-app check:**
- 36 Ganesh Seva files use `Input`. Ganesh's own text already uses `theme.fontFamily.*` (about 240 call sites), so its fields now match the rest of Ganesh. That makes it an improvement, not a restyle.
- Nutrition doesn't use `Input`.
- Verified on the shared sign-in screen that Ganesh Seva lands on. The Email and Password labels changed from Times New Roman to `Inter_500Medium`. The "Ganesh Seva" brand title is serif by design and unchanged.

## 2. `SearchBar` focus ring
**Cause:** on web the browser drew its own outline (`outline: auto`) on the inner `<input>`. That's a square box inside the pill.

**Fix:** `components/common/SearchBar.tsx`, web only:
- The inner input gets `outline-style: none`. `outline-width: 0` alone isn't enough, because Chrome still paints `auto`.
- Focus is shown on the pill instead: the existing accent border plus a 3px ring at 28% of the accent, drawn as a `box-shadow` so it follows the pill's radius.
- Keyboard focus stays clearly visible.
- `accentColor` still sets the ring colour per hub.
- Native is unchanged.

**Callers:** 24, in Expense and Ganesh Seva, all getting the same improvement.

## 3. The form sheet pattern (for 6b–6i)
| Part | Rule |
|---|---|
| Container | `common/Modal`. On tablet/desktop web it's already a centred dialog (SPENDLY-559). |
| Title | `title` prop: one short verb phrase ("Add note", "Edit account"). The close × comes with it. |
| Density | `default` for short forms. `compact` (16 dp gutter) for dense ones such as Add Transaction. |
| Body | Fields only, in a `View` with `gap: 14`. **No nested `ScrollView`:** the sheet body is the scroller (SPENDLY-171). |
| Fields | `components/ui/Input` (theme font, label/helper/error) and `components/common/DateField` for dates (SPENDLY-557). |
| Actions | `footer={<SheetActions … />}`, pinned below the scrolling body so it never scrolls away on a long form. |
| `SheetActions` | `secondary` (usually Cancel, ghost) takes 1 part; `primary` takes 2 parts, min height 48. `tone="destructive"` is for irreversible actions. `primary.loading` / `disabled` come from the form state. |

Example (`components/accounts/AccountNoteModal.tsx` is the reference):
```tsx
<Modal
  isOpen={isOpen}
  onClose={onClose}
  title={note ? "Edit note" : "Add note"}
  footer={
    <SheetActions
      secondary={{ label: "Cancel", onPress: onClose }}
      primary={{ label: note ? "Save" : "Add note", onPress: save, disabled: !canSave, loading: saving }}
    />
  }
>
  <View style={{ gap: 14 }}>{/* fields */}</View>
</Modal>
```

**Geometry:** `components/common/sheetDensity.ts`, pinned by `shared/config/formSheet.test.ts`.
- `sheetBodyPadding(density)` is unchanged for every existing sheet.
- With a footer, the body's bottom padding shrinks to 12, because the footer supplies the space.
- `sheetFooterPadding(density)` uses the same gutter as the body, with a hairline above it.

**Callers not migrated:** existing sheets keep their in-body actions until their own Phase 6 story moves them onto this pattern. Only the note sheet was converted, as the reference.

## QA
**Setup:** web, on the local emulator, opened at `http://127.0.0.1:8091` (local test mode only allows the emulator host). The before state was captured by stashing the change on the same dev server.

| Check | Before | After |
|---|---|---|
| Note sheet labels (Title, Note) | Times New Roman | Inter_500Medium (Midnight Emerald 390 and 320, Light 390) |
| Shared sign-in labels (Ganesh Seva entry) | Times New Roman | Inter_500Medium |
| Ledger search, keyboard focus | `outline: auto 1px` (square box inside the pill) | `outline: none`, accent border plus a 3px ring following the 9999px radius |
| Note sheet actions | In the body, scrolling with it | Pinned footer at the sheet bottom; primary 2:1 vs Cancel; same at 320 |

**Checks run:**
- `npm test`: 378 files, 5,684 tests passed.
- `npm run typecheck:shared`: passed.
- `npx tsc -p tsconfig.json --noEmit`: passed.
- There's no component test runner; the sheet geometry is unit-tested.
- Native device QA is not done.

## Follow-ups (not in this story)
- The root toast's text (`lib/toast.tsx`, Gluestack `ToastTitle`) is also serif on web, from the same undefined `--font-sans`. It's shared by all three products. Other Gluestack text using `font-body` may be affected too. Defining the variable globally would fix it at the root, but needs its own multi-app pass.
- A multiline `Input` doesn't grow to a caller's `minHeight`: the Gluestack field container keeps its row height, so the note body's placeholder scrolls. This was already the case before this story. It belongs with the forms stories (6e–6h).
