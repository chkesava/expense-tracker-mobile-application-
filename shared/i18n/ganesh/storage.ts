/**
 * Local mirror of the resolved language.
 *
 * The language of record lives on `pandals/{id}/members/{uid}`, which is not
 * readable until Firestore hydrates. Without a cache every cold start would
 * paint English and then snap to the member's language a moment later — which
 * looks like a glitch, and on a slow connection at a pandal is a long moment.
 * So the resolved value is mirrored locally and used for the first frame.
 *
 * Namespaced by uid, matching `ganeshSessionStorageKey` — a shared device is
 * normal at a pandal, and one member's language must not leak to the next.
 */
export function ganeshLanguageStorageKey(uid: string): string {
  return `@ganesh_lang:${uid}`;
}
