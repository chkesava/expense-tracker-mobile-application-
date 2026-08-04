export const GROUP_KEYWORDS = [
  "Dinner", 
  "Movie", 
  "Hotel", 
  "Pizza", 
  "Lunch", 
  "Restaurant", 
  "Party", 
  "Outing", 
  "Trip",
  "Travel",
  "Stay",
  "Café",
  "Drinks",
  "Weekend"
];

export const LARGE_EXPENSE_THRESHOLD = 2000;

/**
 * Checks if an expense is a candidate for splitting with others.
 * @param amount The expense amount
 * @param note The expense note/description
 * @returns boolean
 */
export const shouldSuggestSplit = (amount: number, note: string): boolean => {
  if (amount >= LARGE_EXPENSE_THRESHOLD) return true;
  
  const normalizedNote = note.toLowerCase();
  return GROUP_KEYWORDS.some(keyword => 
    normalizedNote.includes(keyword.toLowerCase())
  );
};
