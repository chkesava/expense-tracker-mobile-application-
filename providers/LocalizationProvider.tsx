/**
 * Multi-Language Localization Engine (i18n).
 * Provides instantaneous translations for English, Hindi, Spanish, French, German, Japanese, and Arabic.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useSettings } from "./SettingsProvider";

export type LanguageCode = "en" | "hi" | "es" | "fr" | "de" | "ja" | "ar";

export type LanguageOption = {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  flag: string;
  isRTL?: boolean;
};

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇺🇸" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", flag: "🇮🇳" },
  { code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" },
  { code: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語", flag: "🇯🇵" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦", isRTL: true },
];

export const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    nav_dashboard: "Dashboard",
    nav_expenses: "Expenses",
    nav_add: "Add",
    nav_analytics: "Analytics",
    nav_vaults: "Vaults",
    nav_settings: "Settings",
    nav_cards: "Cards",
    nav_accounts: "Accounts",

    action_save: "Save",
    action_cancel: "Cancel",
    action_delete: "Delete",
    action_edit: "Edit",
    action_add: "Add",
    action_close: "Close",
    action_filter: "Filter",
    action_search: "Search",
    action_export: "Export",
    action_reset: "Reset",
    action_confirm: "Confirm",

    balance_total: "Total Balance",
    balance_available: "Available Balance",
    total_expenses: "Total Expenses",
    total_income: "Total Income",
    net_savings: "Net Savings",
    monthly_budget: "Monthly Budget",
    budget_remaining: "Remaining",
    budget_spent: "Spent",
    savings_goal: "Savings Goal",
    recent_transactions: "Recent Transactions",

    settings_title: "Settings",
    settings_subtitle: "Preferences & Security",
    section_personalize: "Personalize",
    section_general: "General",
    section_profile: "Profile",
    section_privacy: "Privacy & Security",
    section_preview: "Live Theme Preview",

    theme_mode: "Theme Mode",
    theme_mode_system: "System Auto",
    theme_mode_light: "Light",
    theme_mode_dark: "Dark (OLED)",
    theme_mode_custom: "Theme Presets",
    accent_color: "Accent Color",
    currency_label: "Preferred Currency",
    language_label: "Language",
    date_format_label: "Date Format",
    number_format_label: "Number Format",
    first_day_of_week_label: "First Day of Week",

    preview_title: "Interactive Live Preview",
    preview_sample_expense: "Coffee & Pastry",
    preview_sample_budget: "Monthly Budget Status",
    preview_sample_button: "Active Accent Button",
  },
  hi: {
    nav_dashboard: "डैशबोर्ड",
    nav_expenses: "खर्चे",
    nav_add: "जोड़ें",
    nav_analytics: "विश्लेषण",
    nav_vaults: "वॉल्ट्स",
    nav_settings: "सेटिंग्स",
    nav_cards: "कार्ड्स",
    nav_accounts: "खाते",

    action_save: "सहेजें",
    action_cancel: "रद्द करें",
    action_delete: "हटाएं",
    action_edit: "संपादित करें",
    action_add: "जोड़ें",
    action_close: "बंद करें",
    action_filter: "फ़िल्टर",
    action_search: "खोजें",
    action_export: "निर्यात",
    action_reset: "रीसेट",
    action_confirm: "पुष्टि करें",

    balance_total: "कुल शेष",
    balance_available: "उपलब्ध शेष",
    total_expenses: "कुल व्यय",
    total_income: "कुल आय",
    net_savings: "शुद्ध बचत",
    monthly_budget: "मासिक बजट",
    budget_remaining: "शेष राशि",
    budget_spent: "खर्च किया",
    savings_goal: "बचत लक्ष्य",
    recent_transactions: "हाल के लेनदेन",

    settings_title: "सेटिंग्स",
    settings_subtitle: "प्राथमिकताएं एवं सुरक्षा",
    section_personalize: "निजीकरण (Personalize)",
    section_general: "सामान्य",
    section_profile: "प्रोफ़ाइल",
    section_privacy: "गोपनीयता एवं सुरक्षा",
    section_preview: "लाइव थीम पूर्वावलोकन",

    theme_mode: "थीम मोड",
    theme_mode_system: "सिस्टम ऑटो",
    theme_mode_light: "लाइट",
    theme_mode_dark: "डार्क (OLED)",
    theme_mode_custom: "थीम प्रीसेट",
    accent_color: "एक्सेंट रंग (Accent Color)",
    currency_label: "पसंदीदा मुद्रा",
    language_label: "भाषा (Language)",
    date_format_label: "तारीख प्रारूप",
    number_format_label: "संख्या प्रारूप",
    first_day_of_week_label: "सप्ताह का पहला दिन",

    preview_title: "लाइव पूर्वावलोकन",
    preview_sample_expense: "कॉफ़ी और नाश्ता",
    preview_sample_budget: "मासिक बजट स्थिति",
    preview_sample_button: "एक्सेंट बटन",
  },
  es: {
    nav_dashboard: "Panel",
    nav_expenses: "Gastos",
    nav_add: "Añadir",
    nav_analytics: "Analítica",
    nav_vaults: "Bóvedas",
    nav_settings: "Ajustes",
    nav_cards: "Tarjetas",
    nav_accounts: "Cuentas",

    action_save: "Guardar",
    action_cancel: "Cancelar",
    action_delete: "Eliminar",
    action_edit: "Editar",
    action_add: "Añadir",
    action_close: "Cerrar",
    action_filter: "Filtrar",
    action_search: "Buscar",
    action_export: "Exportar",
    action_reset: "Restablecer",
    action_confirm: "Confirmar",

    balance_total: "Saldo Total",
    balance_available: "Saldo Disponible",
    total_expenses: "Gastos Totales",
    total_income: "Ingresos Totales",
    net_savings: "Ahorro Neto",
    monthly_budget: "Presupuesto Mensual",
    budget_remaining: "Restante",
    budget_spent: "Gastado",
    savings_goal: "Meta de Ahorro",
    recent_transactions: "Transacciones Recientes",

    settings_title: "Ajustes",
    settings_subtitle: "Preferencias y Seguridad",
    section_personalize: "Personalización",
    section_general: "General",
    section_profile: "Perfil",
    section_privacy: "Privacidad y Seguridad",
    section_preview: "Vista Previa del Tema",

    theme_mode: "Modo de Tema",
    theme_mode_system: "Automático del Sistema",
    theme_mode_light: "Claro",
    theme_mode_dark: "Oscuro (OLED)",
    theme_mode_custom: "Ajustes Preestablecidos",
    accent_color: "Color de Énfasis",
    currency_label: "Moneda Preferida",
    language_label: "Idioma",
    date_format_label: "Formato de Fecha",
    number_format_label: "Formato de Números",
    first_day_of_week_label: "Primer Día de la Semana",

    preview_title: "Vista Previa en Vivo",
    preview_sample_expense: "Café y Pastelería",
    preview_sample_budget: "Estado del Presupuesto",
    preview_sample_button: "Botón de Énfasis",
  },
  fr: {
    nav_dashboard: "Tableau de Bord",
    nav_expenses: "Dépenses",
    nav_add: "Ajouter",
    nav_analytics: "Analytique",
    nav_vaults: "Coffres",
    nav_settings: "Paramètres",
    nav_cards: "Cartes",
    nav_accounts: "Comptes",

    action_save: "Enregistrer",
    action_cancel: "Annuler",
    action_delete: "Supprimer",
    action_edit: "Modifier",
    action_add: "Ajouter",
    action_close: "Fermer",
    action_filter: "Filtrer",
    action_search: "Rechercher",
    action_export: "Exporter",
    action_reset: "Réinitialiser",
    action_confirm: "Confirmer",

    balance_total: "Solde Total",
    balance_available: "Solde Disponible",
    total_expenses: "Dépenses Totales",
    total_income: "Revenus Totaux",
    net_savings: "Épargne Nette",
    monthly_budget: "Budget Mensuel",
    budget_remaining: "Restant",
    budget_spent: "Dépensé",
    savings_goal: "Objectif d'Épargne",
    recent_transactions: "Transactions Récentes",

    settings_title: "Paramètres",
    settings_subtitle: "Préférences et Sécurité",
    section_personalize: "Personnalisation",
    section_general: "Général",
    section_profile: "Profil",
    section_privacy: "Confidentialité et Sécurité",
    section_preview: "Aperçu du Thème",

    theme_mode: "Mode de Thème",
    theme_mode_system: "Système Automatique",
    theme_mode_light: "Clair",
    theme_mode_dark: "Sombre (OLED)",
    theme_mode_custom: "Thèmes Prédéfinis",
    accent_color: "Couleur d'Accent",
    currency_label: "Devise Préférée",
    language_label: "Langue",
    date_format_label: "Format de Date",
    number_format_label: "Format des Nombres",
    first_day_of_week_label: "Premier Jour de la Semaine",

    preview_title: "Aperçu Interactif",
    preview_sample_expense: "Café et Viennoiserie",
    preview_sample_budget: "État du Budget Mensuel",
    preview_sample_button: "Bouton d'Accent",
  },
  de: {
    nav_dashboard: "Übersicht",
    nav_expenses: "Ausgaben",
    nav_add: "Hinzufügen",
    nav_analytics: "Analysen",
    nav_vaults: "Tresore",
    nav_settings: "Einstellungen",
    nav_cards: "Karten",
    nav_accounts: "Konten",

    action_save: "Speichern",
    action_cancel: "Abbrechen",
    action_delete: "Löschen",
    action_edit: "Bearbeiten",
    action_add: "Hinzufügen",
    action_close: "Schließen",
    action_filter: "Filtern",
    action_search: "Suchen",
    action_export: "Exportieren",
    action_reset: "Zurücksetzen",
    action_confirm: "Bestätigen",

    balance_total: "Gesamtsaldo",
    balance_available: "Verfügbares Guthaben",
    total_expenses: "Gesamtausgaben",
    total_income: "Gesamteinnahmen",
    net_savings: "Nettoersparnis",
    monthly_budget: "Monatsbudget",
    budget_remaining: "Verbleibend",
    budget_spent: "Ausgegeben",
    savings_goal: "Sparziel",
    recent_transactions: "Letzte Buchungen",

    settings_title: "Einstellungen",
    settings_subtitle: "Präferenzen & Sicherheit",
    section_personalize: "Personalisierung",
    section_general: "Allgemein",
    section_profile: "Profil",
    section_privacy: "Datenschutz & Sicherheit",
    section_preview: "Live-Themavorschau",

    theme_mode: "Themamodus",
    theme_mode_system: "System automatisch",
    theme_mode_light: "Hell",
    theme_mode_dark: "Dunkel (OLED)",
    theme_mode_custom: "Voreinstellungen",
    accent_color: "Akzentfarbe",
    currency_label: "Bevorzugte Währung",
    language_label: "Sprache",
    date_format_label: "Datumsformat",
    number_format_label: "Zahlenformat",
    first_day_of_week_label: "Erster Wochentag",

    preview_title: "Interaktive Vorschau",
    preview_sample_expense: "Kaffee & Gebäck",
    preview_sample_budget: "Budget-Status",
    preview_sample_button: "Akzent-Taste",
  },
  ja: {
    nav_dashboard: "ダッシュボード",
    nav_expenses: "支出",
    nav_add: "追加",
    nav_analytics: "分析",
    nav_vaults: "貯金箱",
    nav_settings: "設定",
    nav_cards: "カード",
    nav_accounts: "口座",

    action_save: "保存",
    action_cancel: "キャンセル",
    action_delete: "削除",
    action_edit: "編集",
    action_add: "追加",
    action_close: "閉じる",
    action_filter: "フィルター",
    action_search: "検索",
    action_export: "エクスポート",
    action_reset: "リセット",
    action_confirm: "確認",

    balance_total: "総残高",
    balance_available: "利用可能残高",
    total_expenses: "総支出",
    total_income: "総収入",
    net_savings: "純貯蓄",
    monthly_budget: "月間予算",
    budget_remaining: "残り",
    budget_spent: "支出済み",
    savings_goal: "貯金目標",
    recent_transactions: "最近の取引",

    settings_title: "設定",
    settings_subtitle: "個人設定とセキュリティ",
    section_personalize: "カスタマイズ",
    section_general: "一般",
    section_profile: "プロフィール",
    section_privacy: "プライバシーとセキュリティ",
    section_preview: "テーマプレビュー",

    theme_mode: "テーマモード",
    theme_mode_system: "システム自動",
    theme_mode_light: "ライト",
    theme_mode_dark: "ダーク (OLED)",
    theme_mode_custom: "プリセットテーマ",
    accent_color: "アクセントカラー",
    currency_label: "使用通貨",
    language_label: "言語",
    date_format_label: "日付形式",
    number_format_label: "数値形式",
    first_day_of_week_label: "週の開始曜日",

    preview_title: "リアルタイムプレビュー",
    preview_sample_expense: "カフェ＆スイーツ",
    preview_sample_budget: "今月の予算進捗",
    preview_sample_button: "アクセントボタン",
  },
  ar: {
    nav_dashboard: "لوحة التحكم",
    nav_expenses: "المصروفات",
    nav_add: "إضافة",
    nav_analytics: "التحليلات",
    nav_vaults: "الخزائن",
    nav_settings: "الإعدادات",
    nav_cards: "البطاقات",
    nav_accounts: "الحسابات",

    action_save: "حفظ",
    action_cancel: "إلغاء",
    action_delete: "حذف",
    action_edit: "تعديل",
    action_add: "إضافة",
    action_close: "إغلاق",
    action_filter: "تصفية",
    action_search: "بحث",
    action_export: "تصدير",
    action_reset: "إعادة ضبط",
    action_confirm: "تأكيد",

    balance_total: "الرصيد الإجمالي",
    balance_available: "الرصيد المتاح",
    total_expenses: "إجمالي المصروفات",
    total_income: "إجمالي الدخل",
    net_savings: "صافي المدخرات",
    monthly_budget: "الميزانية الشهرية",
    budget_remaining: "المتبقي",
    budget_spent: "المصروف",
    savings_goal: "هدف الادخار",
    recent_transactions: "المعاملات الأخيرة",

    settings_title: "الإعدادات",
    settings_subtitle: "التفضيلات والأمان",
    section_personalize: "التخصيص",
    section_general: "عام",
    section_profile: "الملف الشخصي",
    section_privacy: "الخصوصية والأمان",
    section_preview: "معاينة المظهر المباشرة",

    theme_mode: "وضع المظهر",
    theme_mode_system: "تلقائي حسب النظام",
    theme_mode_light: "فاتح",
    theme_mode_dark: "داكن (OLED)",
    theme_mode_custom: "أنماط مسبقة",
    accent_color: "لون التمييز",
    currency_label: "العملة المفضلة",
    language_label: "اللغة",
    date_format_label: "تنسيق التاريخ",
    number_format_label: "تنسيق الأرقام",
    first_day_of_week_label: "أول يوم في الأسبوع",

    preview_title: "المعاينة التفاعلية",
    preview_sample_expense: "قهوة ومعجنات",
    preview_sample_budget: "حالة الميزانية الشهرية",
    preview_sample_button: "زر التمييز النشط",
  },
};

type LocalizationContextType = {
  language: LanguageCode;
  t: (key: string, defaultText?: string) => string;
  isRTL: boolean;
};

const LocalizationContext = createContext<LocalizationContextType>({
  language: "en",
  t: (key, defaultText) => defaultText ?? key,
  isRTL: false,
});

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const rawLang = settings?.language as LanguageCode | undefined;
  const language: LanguageCode =
    rawLang && rawLang in TRANSLATIONS ? rawLang : "en";

  const isRTL = Boolean(
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.isRTL
  );

  const t = useCallback(
    (key: string, defaultText?: string): string => {
      const dict = TRANSLATIONS[language];
      if (dict && key in dict) {
        return dict[key];
      }
      // Fallback to English
      const enDict = TRANSLATIONS.en;
      if (enDict && key in enDict) {
        return enDict[key];
      }
      return defaultText ?? key;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      t,
      isRTL,
    }),
    [language, t, isRTL]
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LocalizationContext);
}
