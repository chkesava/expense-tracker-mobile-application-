import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Font from "expo-font";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { cachedCatalog, fallbackMessages, loadCatalog } from "@/shared/i18n/ganesh/catalog";
import { ganeshFontAssetsFor, ganeshFontFamilyFor, type GaneshFontFamily } from "@/shared/i18n/ganesh/fonts";
import { type GaneshMessageKey, type GaneshPluralKey } from "@/shared/i18n/ganesh/keys";
import {
  translate,
  translatePlural,
  type GaneshMessages,
  type InterpolationParams,
} from "@/shared/i18n/ganesh/runtime";
import { ganeshLanguageStorageKey } from "@/shared/i18n/ganesh/storage";
import {
  DEFAULT_GANESH_LANGUAGE,
  GANESH_LANGUAGES,
  coerceGaneshLanguage,
  ganeshScriptFor,
  type GaneshLanguage,
} from "@/shared/i18n/ganesh/types";

/**
 * Ganesh Seva's language state.
 *
 * Deliberately knows nothing about Firestore. The language of record lives on
 * `pandals/{id}/members/{uid}`, which is only readable deep inside
 * `GaneshDataProvider` — but `PrivacyLock`, the auth gate's spinners and the
 * membership gate all render *above* that and still need translating. So this
 * provider is mounted at the top of the Ganesh tree as a plain state holder,
 * and `components/ganesh/i18n/GaneshLanguageSync.tsx` pushes the resolved
 * language up into it from where the member document is actually available.
 *
 * Nothing here reads the device locale: the language is assigned by a Pandal
 * Admin, which is the whole point of the feature.
 */

export type GaneshTranslate = (
  key: GaneshMessageKey,
  params?: InterpolationParams
) => string;

export type GaneshTranslatePlural = (
  key: GaneshPluralKey,
  count: number,
  params?: InterpolationParams
) => string;

type GaneshI18nContextValue = {
  language: GaneshLanguage;
  /** Text families for the active language; null means keep Inter. */
  fontFamily: GaneshFontFamily | null;
  /** False only while a catalog or font is in flight. `t` works regardless. */
  ready: boolean;
  t: GaneshTranslate;
  tn: GaneshTranslatePlural;
  /** Called by `GaneshLanguageSync` once the member document has loaded. */
  setResolvedLanguage: (language: GaneshLanguage) => void;
  /**
   * Loads every script at once, for the language picker — which shows all six
   * endonyms side by side and would otherwise render four of them as tofu.
   */
  loadAllScripts: () => void;
};

/**
 * A default rather than `undefined`: `useGaneshTokens` consumes this, and a
 * Ganesh component rendered outside the provider should degrade to English and
 * Inter, not crash a festival screen.
 */
const GaneshI18nContext = createContext<GaneshI18nContextValue>({
  language: DEFAULT_GANESH_LANGUAGE,
  fontFamily: null,
  ready: true,
  t: (key, params) => translate(key, undefined, fallbackMessages, params),
  tn: (key, count, params) =>
    translatePlural(key, count, DEFAULT_GANESH_LANGUAGE, undefined, fallbackMessages, params),
  setResolvedLanguage: () => {},
  loadAllScripts: () => {},
});

export function GaneshI18nProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const uid = realUser?.uid ?? null;

  const [language, setLanguage] = useState<GaneshLanguage>(DEFAULT_GANESH_LANGUAGE);
  const [messages, setMessages] = useState<GaneshMessages | undefined>(fallbackMessages);
  const [fontsLoaded, setFontsLoaded] = useState(true);
  const [catalogReady, setCatalogReady] = useState(true);
  const [allScripts, setAllScripts] = useState(false);
  /** The value last written to storage, so a no-op change writes nothing. */
  const persisted = useRef<GaneshLanguage | null>(null);

  // Hydrate from the local mirror so the *second* and every later launch paints
  // in the member's language on the first frame instead of flashing English.
  useEffect(() => {
    if (!uid) {
      setLanguage(DEFAULT_GANESH_LANGUAGE);
      persisted.current = null;
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(ganeshLanguageStorageKey(uid))
      .then((raw) => {
        if (cancelled) return;
        // No cache means a first sign-in on this device — fall back to English
        // rather than leaving whatever the previous account was reading on
        // screen. Sharing one phone between committee members is normal.
        if (!raw) {
          persisted.current = null;
          setLanguage(DEFAULT_GANESH_LANGUAGE);
          return;
        }
        const cached = coerceGaneshLanguage(raw);
        persisted.current = cached;
        setLanguage(cached);
      })
      .catch((error) => logError("ganeshI18n.hydrate", error));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const setResolvedLanguage = useCallback(
    (next: GaneshLanguage) => {
      setLanguage(next);
      if (!uid || persisted.current === next) return;
      persisted.current = next;
      AsyncStorage.setItem(ganeshLanguageStorageKey(uid), next).catch((error) =>
        logError("ganeshI18n.persist", error)
      );
    },
    [uid]
  );

  const loadAllScripts = useCallback(() => setAllScripts(true), []);

  // Catalog. English is already in hand, so this only ever runs for the other
  // five, and `t` keeps resolving against English until it lands.
  useEffect(() => {
    const hit = cachedCatalog(language);
    if (hit) {
      setMessages(hit);
      setCatalogReady(true);
      return;
    }
    let cancelled = false;
    setCatalogReady(false);
    loadCatalog(language)
      .then((loaded) => {
        if (cancelled) return;
        setMessages(loaded);
      })
      .finally(() => {
        if (!cancelled) setCatalogReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Fonts. Inter has no Indic glyphs, so a translated screen needs Noto for the
  // active script — and every script at once on the picker screens.
  useEffect(() => {
    const scripts = allScripts
      ? GANESH_LANGUAGES.map(ganeshScriptFor)
      : [ganeshScriptFor(language)];
    const assets = ganeshFontAssetsFor(scripts);
    if (Object.keys(assets).length === 0) {
      setFontsLoaded(true);
      return;
    }
    let cancelled = false;
    setFontsLoaded(false);
    Font.loadAsync(assets as Parameters<typeof Font.loadAsync>[0])
      .catch((error) => {
        // A font that will not load must never hold the UI hostage — the
        // platform's own script fallback still renders readable text. Mirrors
        // the `fontsLoaded || fontError` reasoning in app/_layout.tsx.
        logError("ganeshI18n.fonts", error);
      })
      .finally(() => {
        if (!cancelled) setFontsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language, allScripts]);

  const t = useCallback<GaneshTranslate>(
    (key, params) => translate(key, messages, fallbackMessages, params),
    [messages]
  );

  const tn = useCallback<GaneshTranslatePlural>(
    (key, count, params) =>
      translatePlural(key, count, language, messages, fallbackMessages, params),
    [messages, language]
  );

  const value = useMemo<GaneshI18nContextValue>(
    () => ({
      language,
      fontFamily: ganeshFontFamilyFor(ganeshScriptFor(language)),
      ready: catalogReady && fontsLoaded,
      t,
      tn,
      setResolvedLanguage,
      loadAllScripts,
    }),
    [language, catalogReady, fontsLoaded, t, tn, setResolvedLanguage, loadAllScripts]
  );

  return <GaneshI18nContext.Provider value={value}>{children}</GaneshI18nContext.Provider>;
}

export function useGaneshI18n(): GaneshI18nContextValue {
  return useContext(GaneshI18nContext);
}

/** The common case: just the translate function. */
export function useGaneshT(): GaneshTranslate {
  return useContext(GaneshI18nContext).t;
}
