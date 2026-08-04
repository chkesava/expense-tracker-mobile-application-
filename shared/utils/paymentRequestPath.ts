/** Resolve slug from pathname (and optional param) for /payment/:slug or legacy /pay/:slug. */
export function getPaymentSlugFromLocation(
  pathname: string,
  paramSlug?: string
): string | undefined {
  if (paramSlug) return paramSlug;

  const payment = pathname.match(/^\/payment\/([^/]+)\/?$/);
  if (payment?.[1]) return decodeURIComponent(payment[1]);

  const legacy = pathname.match(/^\/pay\/([^/]+)\/?$/);
  if (legacy?.[1]) return decodeURIComponent(legacy[1]);

  return undefined;
}
