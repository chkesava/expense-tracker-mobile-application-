/**
 * SPENDLY-708: where toasts are drawn.
 *
 * A sheet (`components/common/Modal`) opens its own window: a portal above the
 * app on web, a separate native window on Android/iOS. A toast drawn in the
 * app's main view sits under it, so errors raised inside a sheet were never
 * seen. Each open sheet registers a host; toasts draw in the newest one, and
 * in the main view only when no sheet is open. One place at a time, so a toast
 * is never shown twice, and one still showing carries over when a sheet closes.
 */
export type ToastHostId = string;

/** The main view's place (always there, used when no sheet is open). */
export const ROOT_TOAST_HOST: ToastHostId = "root";

export function addToastHost(hosts: readonly ToastHostId[], id: ToastHostId): ToastHostId[] {
  return hosts.includes(id) ? [...hosts] : [...hosts, id];
}

export function removeToastHost(hosts: readonly ToastHostId[], id: ToastHostId): ToastHostId[] {
  return hosts.filter((h) => h !== id);
}

/** The host that draws toasts now: the newest open sheet, else the main view. */
export function activeToastHost(hosts: readonly ToastHostId[]): ToastHostId {
  return hosts.length > 0 ? hosts[hosts.length - 1] : ROOT_TOAST_HOST;
}
