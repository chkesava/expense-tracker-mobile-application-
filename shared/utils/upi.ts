/**
 * Generates a UPI payment deep link.
 * Open with Linking.openURL on React Native (Phase 14+).
 */
export const generateUpiLink = (
  upiId: string,
  name: string,
  amount: number,
  note: string = "Expense Split"
): string => {
  if (!upiId) return "";

  const encodedName = encodeURIComponent(name);
  const encodedNote = encodeURIComponent(note);

  return `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amount.toFixed(2)}&tn=${encodedNote}&cu=INR`;
};

/**
 * Whether the runtime is likely able to open UPI deep links.
 * Non-DOM runtimes (React Native) are treated as mobile-capable.
 */
export const isMobile = (): boolean => {
  if (typeof navigator === "undefined") return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent ?? ""
  );
};
