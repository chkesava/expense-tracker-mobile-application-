import type { ExpensePurposeCategory } from "@/shared/types/ganeshSessions";
import { purposeForCategoryName } from "@/shared/utils/ganeshMoneyPurpose";

/**
 * The categories a new festival starts with.
 *
 * `purposeCategory` is the canonical axis reports group on (GS-078). The name
 * is the committee's vocabulary and they may rename or replace it; the purpose
 * underneath is what makes two festivals comparable.
 */
export const DEFAULT_GANESH_CATEGORIES: Array<{
  name: string;
  sortOrder: number;
  purposeCategory: ExpensePurposeCategory;
}> = [
  { name: "Idol", sortOrder: 10, purposeCategory: "idol_religious" },
  { name: "Decoration", sortOrder: 20, purposeCategory: "decoration" },
  { name: "Flowers", sortOrder: 30, purposeCategory: "flowers_pooja" },
  { name: "Pooja Materials", sortOrder: 40, purposeCategory: "flowers_pooja" },
  { name: "Sound System", sortOrder: 50, purposeCategory: "sound" },
  { name: "Lighting", sortOrder: 60, purposeCategory: "lighting" },
  { name: "Electricity", sortOrder: 70, purposeCategory: "electrical" },
  { name: "Mandap / Pandal", sortOrder: 80, purposeCategory: "pandal_setup" },
  { name: "Chairs / Tables", sortOrder: 90, purposeCategory: "pandal_setup" },
  { name: "Food", sortOrder: 100, purposeCategory: "food_prasadam" },
  { name: "Prasadam", sortOrder: 110, purposeCategory: "food_prasadam" },
  { name: "Water", sortOrder: 120, purposeCategory: "water" },
  { name: "Transportation", sortOrder: 130, purposeCategory: "transportation" },
  { name: "Cleaning", sortOrder: 140, purposeCategory: "cleaning" },
  { name: "Printing", sortOrder: 150, purposeCategory: "printing_publicity" },
  { name: "Invitations", sortOrder: 160, purposeCategory: "printing_publicity" },
  { name: "Cultural Programs", sortOrder: 170, purposeCategory: "cultural_programs" },
  { name: "Music", sortOrder: 180, purposeCategory: "sound" },
  { name: "Security", sortOrder: 190, purposeCategory: "security" },
  { name: "Immersion / Visarjan", sortOrder: 200, purposeCategory: "visarjan" },
  { name: "Miscellaneous", sortOrder: 210, purposeCategory: "other_festival_expense" },
];

/** Re-exported so callers classifying a custom category have one source. */
export { purposeForCategoryName };
