import { FilterChips, type ChipOption } from "@/components/ganesh/ui";
import { useGaneshI18n, type GaneshTranslate } from "@/providers/GaneshI18nProvider";
import {
  GANESH_LANGUAGES,
  GANESH_LANGUAGE_META,
  type GaneshLanguage,
} from "@/shared/i18n/ganesh/types";
import { useEffect } from "react";

/** `inherit` means "follow the Pandal default" rather than a language of its own. */
export const INHERIT_LANGUAGE = "inherit" as const;

export type LanguageChoice = GaneshLanguage | typeof INHERIT_LANGUAGE;

/**
 * The language chips, shared by the member screen and Admin settings so the two
 * cannot drift.
 *
 * `FilterChips` is the sanctioned Ganesh chip control — the same one used for
 * fund locations and ledger filters — so this adds no new component to the kit
 * and inherits the wrap behaviour small Android screens need for six options.
 *
 * Each chip carries the endonym *and* the English name: an admin who reads only
 * English still has to be able to pick Telugu, and the member looking over
 * their shoulder has to recognise their own language.
 */
function optionsFor(
  t: GaneshTranslate,
  inheritedDefault?: GaneshLanguage
): Array<ChipOption<LanguageChoice>> {
  const languages: Array<ChipOption<LanguageChoice>> = GANESH_LANGUAGES.map((code) => {
    const meta = GANESH_LANGUAGE_META[code];
    return {
      id: code,
      label: code === "en" ? meta.englishLabel : `${meta.nativeLabel} · ${meta.englishLabel}`,
    };
  });

  if (!inheritedDefault) return languages;

  // Without an explicit "follow the committee" option an admin can never undo
  // an override, and the inheritance model becomes write-only.
  return [
    {
      id: INHERIT_LANGUAGE,
      label: t("language.member.inherit", {
        language: GANESH_LANGUAGE_META[inheritedDefault].nativeLabel,
      }),
    },
    ...languages,
  ];
}

export function GaneshLanguagePicker({
  value,
  onChange,
  inheritedDefault,
  disabled,
}: {
  value: LanguageChoice;
  onChange: (choice: LanguageChoice) => void;
  /**
   * The Pandal default. Passing it adds the "Pandal default" chip — so omit it
   * on the screen that *sets* the default.
   */
  inheritedDefault?: GaneshLanguage;
  disabled?: boolean;
}) {
  const { t, loadAllScripts } = useGaneshI18n();

  // This is the one place all six scripts render at once, so all six fonts have
  // to be resident — otherwise four of the chips show tofu at exactly the
  // moment an admin needs to read them.
  useEffect(() => {
    loadAllScripts();
  }, [loadAllScripts]);

  return (
    <FilterChips
      layout="wrap"
      value={value}
      options={optionsFor(t, inheritedDefault)}
      onChange={onChange}
      disabled={disabled}
      testID="ganesh-language-picker"
    />
  );
}
