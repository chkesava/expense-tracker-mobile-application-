/**
 * The language setting itself.
 *
 * Deliberately translated like everything else: an admin who reads Telugu
 * should see this section in Telugu while assigning Tamil to someone else.
 */
export const language = {
  "language.member.title": "Display language",
  "language.member.subtitle": "Choose the language this member sees the app in",
  "language.member.saved": "Language updated",
  "language.member.error": "Could not change this member's language.",
  "language.member.noPermission": "Only a Pandal Admin can change a member's language.",

  "language.pandal.title": "Default language",
  "language.pandal.subtitle": "New members start in this language until you change theirs",

  "language.member.cleared": "Member follows the Pandal default",
  "language.pandal.saved": "Default language updated",
  "language.member.inherit": "Pandal default ({{language}})",
  "language.row.meta": "Language: {{language}}",
} as const;
