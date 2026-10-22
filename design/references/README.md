# Spendly Dashboard Design Reference Pack

This pack contains the shared design guide, dashboard background assets from the existing dashboard asset archive, named Jira-reference aliases where a source was available, and generated visual concepts retained under `design/references/generated/`.

## Use with Claude Code

1. Extract the ZIP at the root of the Spendly repository (merge the included `design/` and `assets/` folders).
2. Read `design/references/DESIGN.md` first.
3. Inspect the relevant image for the Jira ticket before implementing.
4. Treat all amounts, names, dates, categories, and charts in mockups as visual placeholders, never production data.
5. If a named reference is missing or does not match the intended screen, report it and use the original concepts in `generated/` to identify the correct one.

## Structure

```text
assets/images/dashboard/       # Existing morning/afternoon/evening/night backgrounds, if present in prior pack
design/references/
  DESIGN.md                    # Shared design system
  README.md                    # This file
  spendly-*.png                # Named reference aliases, when source images were available
  generated/                   # Original generated concepts, filenames retained
```

## Named reference images available at pack creation

| `spendly-budget-progress-drilldown.png` | 1536 × 1024 |
| `spendly-dashboard-moodboard.png` | 1536 × 1024 |
| `spendly-dashboard-reference.png` | 887 × 1774 |
| `spendly-highest-spending-categories.png` | 1536 × 1024 |
| `spendly-individual-transaction-details.png` | 1536 × 1024 |
| `spendly-recent-transactions-drilldown.png` | 1536 × 1024 |
| `spendly-recurring-expenses.png` | 1536 × 1024 |
| `spendly-spending-by-subcategory.png` | 1536 × 1024 |
| `spendly-spending-category-details.png` | 1536 × 1024 |
| `spendly-spending-trends-drilldown.png` | 1536 × 1024 |
| `spendly-total-spending-drilldown.png` | 1536 × 1024 |

## Generated originals

| File | Dimensions |
|---|---|
| `generated/25ace531-5e5c-4e02-b071-64e748e02dd8.png` | 1915 × 1029 |
| `generated/2ffe35a8-7f66-4620-9b90-2bff162cadd3.png` | 1917 × 949 |
| `generated/42c04d06-d25d-4fbb-b424-f0874b05cbd6.png` | 1842 × 1042 |
| `generated/a_clean_high_fidelity_ui_ux_mockup_image_consisti.png` | 1536 × 1024 |
| `generated/a_high_resolution_poster_style_ui_ux_concept_imag.png` | 1223 × 1286 |
| `generated/a_wide_cinematic_ultra_detailed_digital_illustra.png` | 1254 × 1254 |
| `generated/a_wide_clean_high_resolution_collage_board_of_sc.png` | 1536 × 1024 |
| `generated/a_wide_composite_image_of_four_smartphone_ui_mocku.png` | 1536 × 1024 |
| `generated/a_wide_detailed_ui_mockup_composite_image_of_a_mo.png` | 1536 × 1024 |
| `generated/a_wide_high_fidelity_mobile_app_ui_concept_image.png` | 1536 × 1024 |
| `generated/a_wide_high_resolution_ui_mockup_triptych_of_a_mo.png` | 1536 × 1024 |
| `generated/a_wide_high_resolution_ui_ux_concept_mockup_image.png` | 1536 × 1024 |
| `generated/a_wide_high_resolution_ui_ux_concept_mockup_on_a.png` | 1536 × 1024 |
| `generated/a_wide_high_resolution_ui_ux_design_mockup_of_a_f.png` | 1536 × 1024 |
| `generated/wide_cinematic_landscape_illustration_scene_a_se.png` | 1254 × 1254 |
| `generated/wide_cinematic_painterly_illustration_style_land.png` | 1219 × 1290 |
| `generated/wide_landscape_illustration_scene_a_serene_styli.png` | 1219 × 1290 |
| `generated/wide_multi_panel_mobile_app_ui_mockup_screenshot.png` | 1536 × 1024 |

## Visual consistency note

The generated concepts were produced at different points and some have different palettes. Follow `DESIGN.md` and the existing app theme as the source of truth; use image composition and information hierarchy as inspiration rather than blindly copying inconsistent colors.
