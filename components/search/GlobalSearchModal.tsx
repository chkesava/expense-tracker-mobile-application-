import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, type Href } from "expo-router";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  Landmark,
  PlusCircle,
  Receipt,
  Repeat,
  Search,
  Sparkles,
  Store,
  Tag,
  Target,
  X,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HighlightedText } from "@/components/analytics/search/HighlightedText";
import { useSpendlyScopeVars } from "@/components/layout/SpendlyUIScope";
import {
  Modal as GluestackModal,
  ModalBackdrop,
  ModalContent,
} from "@/components/ui/modal";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useIncomes } from "@/hooks/useIncomes";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { haptic } from "@/lib/haptics";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import { useGlobalMonth, useModalActions, useModalUi } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { CORE_NAV_ITEMS, LEDGER_SECTIONS } from "@/shared/config/navigation";
import {
  addRecentSearch,
  removeRecentSearch,
  searchGlobalItems,
  type GlobalSearchActionItem,
  type GlobalSearchResult,
  type GlobalSearchResultKind,
  type GlobalSearchScreenItem,
} from "@/shared/utils/globalSearch";
import {
  buildMerchantLedgerItems,
  buildMerchantProfiles,
} from "@/shared/utils/merchantGrouping";
import {
  SPENDLY_DIALOG_MAX_WIDTH,
  sheetPresentationOf,
} from "@/shared/utils/responsiveLayout";
import { useTheme } from "@/theme/ThemeProvider";

const RECENT_SEARCHES_STORAGE_KEY = "@spendly_recent_searches";

export function GlobalSearchModal() {
  const { isGlobalSearchOpen } = useModalUi();
  const {
    setIsGlobalSearchOpen,
    setIsAddExpenseOpen,
    setAddTransactionKind,
    setIsTransferOpen,
    setIsReceiptScannerOpen,
    setIsMagicChatOpen,
    setIsCreateInvestmentOpen,
    setIsCreateReceivableOpen,
    setIsCreateBorrowingOpen,
  } = useModalActions();

  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scopeVars = useSpendlyScopeVars();
  const { layout } = useResponsiveLayout();
  const asDialog = scopeVars !== null && sheetPresentationOf(layout) === "dialog";

  const { globalMonth } = useGlobalMonth();
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const ghostMoney = useGhostMoney(currency);

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { accounts } = useAccounts();
  const { parentCategories, getSubcategories } = useCategories();
  const { subscriptions, goals } = useExpenseReferenceData();

  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const recentSearchesRef = useRef(recentSearches);
  recentSearchesRef.current = recentSearches;
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<TextInput>(null);

  // Load recent searches from AsyncStorage on mount
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setRecentSearches(parsed.slice(0, 8));
          }
        } catch {
          // ignore corrupted json
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const saveRecent = useCallback((term: string) => {
    const updated = addRecentSearch(recentSearchesRef.current, term, 8);
    setRecentSearches(updated);
    AsyncStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(updated)
    ).catch(() => undefined);
  }, []);

  const handleRemoveRecent = useCallback((term: string) => {
    const updated = removeRecentSearch(recentSearchesRef.current, term);
    setRecentSearches(updated);
    AsyncStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(updated)
    ).catch(() => undefined);
  }, []);

  const handleClearAllRecent = useCallback(() => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY).catch(() => undefined);
  }, []);

  // Prepare Actions & Screens
  const actionItems: GlobalSearchActionItem[] = useMemo(
    () => [
      {
        id: "add_expense",
        title: "Add Expense",
        subtitle: "Record a new expense",
        keywords: ["spend", "transaction", "pay", "new expense"],
      },
      {
        id: "add_income",
        title: "Add Income",
        subtitle: "Record incoming funds",
        keywords: ["salary", "deposit", "earn", "income"],
      },
      {
        id: "transfer",
        title: "Transfer",
        subtitle: "Move money between accounts",
        keywords: ["move", "wire", "shift", "transfer"],
      },
      {
        id: "scan_receipt",
        title: "Scan Receipt",
        subtitle: "Extract items with camera",
        keywords: ["camera", "ocr", "receipt", "bill scan"],
      },
      {
        id: "magic_chat",
        title: "Magic Chat",
        subtitle: "AI transaction assistant",
        keywords: ["ai", "assistant", "chat", "magic"],
      },
      {
        id: "add_investment",
        title: "Add Investment",
        subtitle: "Track stock, mutual fund or bond",
        keywords: ["stocks", "mf", "sip", "portfolio"],
      },
      {
        id: "lend_money",
        title: "Money Lent (Receivable)",
        subtitle: "Record money you lent someone",
        keywords: ["lent", "receivable", "debt", "owe"],
      },
      {
        id: "borrow_money",
        title: "Borrow Money",
        subtitle: "Record money borrowed from someone",
        keywords: ["borrow", "loan", "debt"],
      },
    ],
    []
  );

  const screenItems: GlobalSearchScreenItem[] = useMemo(() => {
    const screens: GlobalSearchScreenItem[] = CORE_NAV_ITEMS.map((item) => ({
      id: item.id,
      title: item.label,
      subtitle: "Main section",
      href: item.path,
      keywords: ["navigation", item.label.toLowerCase()],
    }));

    for (const sec of LEDGER_SECTIONS) {
      screens.push({
        id: `ledger_${sec.id}`,
        title: sec.title,
        subtitle: sec.subtitle,
        href: `/ledger?tab=${sec.id}`,
        keywords: [sec.label.toLowerCase(), sec.subtitle.toLowerCase(), "money"],
      });
    }

    screens.push(
      {
        id: "settings_appearance",
        title: "Settings › Appearance",
        subtitle: "Theme and color palette",
        href: "/settings",
        keywords: ["theme", "dark mode", "palette", "appearance"],
      },
      {
        id: "settings_privacy",
        title: "Settings › Privacy",
        subtitle: "PIN, duress and Ghost Mode",
        href: "/settings",
        keywords: ["ghost mode", "pin", "lock", "privacy", "security"],
      },
      {
        id: "insights_search",
        title: "Insights › Search & Lab",
        subtitle: "Deep transaction analysis",
        href: "/insights?tab=search",
        keywords: ["filter", "advanced search", "analysis", "lab"],
      }
    );

    return screens;
  }, []);

  // Category items
  const categoryItems = useMemo(() => {
    if (!isGlobalSearchOpen) return [];
    return parentCategories.map((c) => ({
      name: c.name,
      subcategories: getSubcategories(c.id).map((sub) => sub.name),
    }));
  }, [isGlobalSearchOpen, parentCategories, getSubcategories]);

  // Distinct derived merchants from loaded transactions
  const merchantItems = useMemo(() => {
    if (!isGlobalSearchOpen) return [];
    const profiles = buildMerchantProfiles(
      buildMerchantLedgerItems(expenses, incomes)
    );
    return profiles.map((p) => ({
      id: p.merchantId,
      name: p.displayName,
      count: p.transactionCount,
      totalAmount: p.totalSpend,
      currency,
    }));
  }, [isGlobalSearchOpen, expenses, incomes, currency]);

  // Transaction items
  const transactionItems = useMemo(() => {
    if (!isGlobalSearchOpen) return [];
    const accountInfoById = new Map(
      accounts.map((a) => [
        a.id,
        {
          displayName: a.displayName ?? a.name,
          searchText: [a.name, a.displayName].filter(Boolean).join(" "),
        },
      ])
    );
    const list: Array<
      NonNullable<Parameters<typeof searchGlobalItems>[1]["transactions"]>[number]
    > = [];
    for (const exp of expenses) {
      if (!exp.id) continue;
      const accInfo = exp.accountId ? accountInfoById.get(exp.accountId) : undefined;
      list.push({
        id: exp.id,
        kind: "expense",
        amount: exp.amount,
        currency,
        date: exp.date,
        note: exp.note,
        category: exp.category,
        subcategory: exp.subcategory,
        accountName: accInfo?.displayName,
        accountSearchText: accInfo?.searchText,
        accountId: exp.accountId,
        tags: exp.tags,
      });
    }
    for (const inc of incomes) {
      if (!inc.id) continue;
      const accInfo = inc.accountId ? accountInfoById.get(inc.accountId) : undefined;
      list.push({
        id: inc.id,
        kind: "income",
        amount: inc.amount,
        currency,
        date: inc.date,
        note: inc.note,
        source: inc.source,
        accountName: accInfo?.displayName,
        accountSearchText: accInfo?.searchText,
        accountId: inc.accountId,
      });
    }
    return list;
  }, [isGlobalSearchOpen, expenses, incomes, accounts, currency]);

  // Recurring & Goals items
  const recurringItems = useMemo(() => {
    if (!isGlobalSearchOpen) return [];
    return (subscriptions ?? [])
      .filter((s): s is typeof s & { id: string } => typeof s.id === "string")
      .map((s) => ({
        id: s.id,
        name: s.name,
        amount: s.amount,
        currency,
        nextDate: s.dayOfMonth ? `Day ${s.dayOfMonth}` : undefined,
      }));
  }, [isGlobalSearchOpen, subscriptions, currency]);

  const goalItems = useMemo(() => {
    if (!isGlobalSearchOpen) return [];
    return (goals ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      currency,
    }));
  }, [isGlobalSearchOpen, goals, currency]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!isGlobalSearchOpen) {
      return {
        groups: [],
        totalMatches: 0,
        totalTransactionMatches: 0,
      };
    }
    return searchGlobalItems(query, {
      actions: actionItems,
      screens: screenItems,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        displayName: a.displayName,
        institution: a.institutionName ?? a.institutionId,
        type: a.accountTypeId,
        balance: a.currentBalance ?? a.openingBalance,
        currency: a.currency ?? currency,
      })),
      categories: categoryItems,
      merchants: merchantItems,
      transactions: transactionItems,
      recurring: recurringItems,
      goals: goalItems,
      currentMonth: globalMonth ?? undefined,
    });
  }, [
    isGlobalSearchOpen,
    query,
    actionItems,
    screenItems,
    accounts,
    categoryItems,
    merchantItems,
    transactionItems,
    recurringItems,
    goalItems,
    globalMonth,
    currency,
  ]);

  // Flattened items for keyboard navigation
  const flatItems = useMemo(() => {
    const items: GlobalSearchResult[] = [];
    for (const grp of searchResults.groups) {
      items.push(...grp.items);
    }
    return items;
  }, [searchResults]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleClose = useCallback(() => {
    setIsGlobalSearchOpen(false);
    setQuery("");
  }, [setIsGlobalSearchOpen]);

  const handleSelectResult = useCallback(
    (item: GlobalSearchResult) => {
      void haptic.selection();
      if (query.trim()) {
        saveRecent(query.trim());
      }
      handleClose();

      if (item.actionId) {
        switch (item.actionId) {
          case "add_expense":
            setAddTransactionKind("expense");
            setIsAddExpenseOpen(true);
            break;
          case "add_income":
            setAddTransactionKind("income");
            setIsAddExpenseOpen(true);
            break;
          case "transfer":
            setIsTransferOpen(true);
            break;
          case "scan_receipt":
            setIsReceiptScannerOpen(true);
            break;
          case "magic_chat":
            setIsMagicChatOpen(true);
            break;
          case "add_investment":
            setIsCreateInvestmentOpen(true);
            break;
          case "lend_money":
            setIsCreateReceivableOpen(true);
            break;
          case "borrow_money":
            setIsCreateBorrowingOpen(true);
            break;
        }
        return;
      }

      if (item.href) {
        router.push(item.href as Href);
      }
    },
    [
      query,
      saveRecent,
      handleClose,
      setAddTransactionKind,
      setIsAddExpenseOpen,
      setIsTransferOpen,
      setIsReceiptScannerOpen,
      setIsMagicChatOpen,
      setIsCreateInvestmentOpen,
      setIsCreateReceivableOpen,
      setIsCreateBorrowingOpen,
      router,
    ]
  );

  const handleQuickAction = useCallback(
    (actionId: string) => {
      void haptic.selection();
      handleClose();
      switch (actionId) {
        case "add_expense":
          setAddTransactionKind("expense");
          setIsAddExpenseOpen(true);
          break;
        case "add_income":
          setAddTransactionKind("income");
          setIsAddExpenseOpen(true);
          break;
        case "transfer":
          setIsTransferOpen(true);
          break;
        case "scan_receipt":
          setIsReceiptScannerOpen(true);
          break;
        case "magic_chat":
          setIsMagicChatOpen(true);
          break;
      }
    },
    [
      handleClose,
      setAddTransactionKind,
      setIsAddExpenseOpen,
      setIsTransferOpen,
      setIsReceiptScannerOpen,
      setIsMagicChatOpen,
    ]
  );

  const handleNavigateToSearchLab = useCallback(() => {
    void haptic.selection();
    if (query.trim()) {
      saveRecent(query.trim());
    }
    handleClose();
    router.push(`/insights?tab=search&q=${encodeURIComponent(query)}` as Href);
  }, [query, saveRecent, handleClose, router]);

  // Web keyboard navigation
  const handleKeyDown = useCallback(
    (e: any) => {
      if (Platform.OS !== "web") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (flatItems.length ? (prev + 1) % flatItems.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          flatItems.length ? (prev - 1 + flatItems.length) % flatItems.length : 0
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[activeIndex]) {
          handleSelectResult(flatItems[activeIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [flatItems, activeIndex, handleSelectResult, handleClose]
  );

  // Auto focus input when opened
  useEffect(() => {
    if (isGlobalSearchOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isGlobalSearchOpen]);

  const renderIconForKind = (kind: GlobalSearchResultKind, isIncome?: boolean) => {
    const iconSize = 16;
    const color = theme.colors.mutedForeground;
    switch (kind) {
      case "action":
        return <PlusCircle size={iconSize} color={theme.colors.primary} />;
      case "screen":
        return <Compass size={iconSize} color={color} />;
      case "account":
        return <Landmark size={iconSize} color={color} />;
      case "category":
        return <Tag size={iconSize} color={color} />;
      case "merchant":
        return <Store size={iconSize} color={color} />;
      case "transaction":
        return isIncome ? (
          <ArrowDownLeft size={iconSize} color={theme.colors.success} />
        ) : (
          <ArrowUpRight size={iconSize} color={theme.colors.destructive} />
        );
      case "recurring":
        return <Repeat size={iconSize} color={color} />;
      case "goal":
        return <Target size={iconSize} color={color} />;
      default:
        return <Search size={iconSize} color={color} />;
    }
  };

  let globalFlatCursor = 0;

  return (
    <GluestackModal
      isOpen={isGlobalSearchOpen}
      onClose={handleClose}
      size="md"
      className={asDialog ? "justify-center items-center m-0 p-0 w-full" : "justify-end m-0 p-0 w-full"}
      useRNModal
    >
      <ModalBackdrop />
      <ModalContent
        className={
          asDialog
            ? "w-full bg-card rounded-2xl border border-border overflow-hidden m-0 p-0"
            : "w-full bg-card rounded-t-3xl rounded-b-none border-t border-border overflow-hidden m-0 p-0"
        }
        style={[
          scopeVars,
          styles.modalContent,
          asDialog
            ? { maxWidth: SPENDLY_DIALOG_MAX_WIDTH, maxHeight: 600 }
            : {
                maxHeight: "90%",
                paddingBottom: Math.max(insets.bottom, 20),
              },
        ]}
      >
        {/* Pinned Search Input Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Search size={20} color={theme.colors.mutedForeground} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.regular,
              },
            ]}
            placeholder="Search transactions, accounts, categories…"
            placeholderTextColor={theme.colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            // @ts-ignore web key handler
            onKeyDown={handleKeyDown}
            accessibilityRole="search"
            accessibilityLabel="Search transactions, accounts, categories and screens"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleClose}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Text
                style={[
                  styles.escText,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                ]}
              >
                {Platform.OS === "web" ? "Esc" : "Close"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Scrollable Results Body */}
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {query.trim().length === 0 ? (
            /* Empty State: Recent Searches + Quick Actions */
            <View style={styles.emptyContainer}>
              {recentSearches.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text
                      style={[
                        styles.sectionHeaderTitle,
                        { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      RECENT SEARCHES
                    </Text>
                    <Pressable onPress={handleClearAllRecent} accessibilityRole="button">
                      <Text
                        style={[
                          styles.clearAllText,
                          { color: theme.colors.primary, fontFamily: theme.fontFamily.medium },
                        ]}
                      >
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.recentWrap}>
                    {recentSearches.map((term) => (
                      <View
                        key={term}
                        style={[
                          styles.recentChip,
                          {
                            backgroundColor: theme.colors.muted,
                            borderColor: theme.colors.border,
                          },
                        ]}
                      >
                        <Pressable
                          style={styles.recentChipMain}
                          onPress={() => {
                            void haptic.selection();
                            setQuery(term);
                          }}
                        >
                          <Clock size={12} color={theme.colors.mutedForeground} />
                          <Text
                            style={[
                              styles.recentChipText,
                              { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                            ]}
                            numberOfLines={1}
                          >
                            {term}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.recentChipRemove}
                          onPress={() => handleRemoveRecent(term)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${term} from recent searches`}
                        >
                          <X size={12} color={theme.colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Quick Actions */}
              <View style={styles.section}>
                <Text
                  style={[
                    styles.sectionHeaderTitle,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  QUICK ACTIONS
                </Text>
                <View style={styles.quickActionsGrid}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.quickActionButton,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleQuickAction("add_expense")}
                  >
                    <PlusCircle size={18} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.quickActionText,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      Add Expense
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.quickActionButton,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleQuickAction("add_income")}
                  >
                    <ArrowDownLeft size={18} color={theme.colors.success} />
                    <Text
                      style={[
                        styles.quickActionText,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      Add Income
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.quickActionButton,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleQuickAction("transfer")}
                  >
                    <ArrowRightLeft size={18} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.quickActionText,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      Transfer
                    </Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.quickActionButton,
                      {
                        backgroundColor: theme.colors.card,
                        borderColor: theme.colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => handleQuickAction("scan_receipt")}
                  >
                    <Camera size={18} color={theme.colors.primary} />
                    <Text
                      style={[
                        styles.quickActionText,
                        { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                      ]}
                    >
                      Scan Receipt
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : searchResults.groups.length === 0 ? (
            /* No Results Found */
            <View style={styles.noResultsContainer}>
              <Search size={32} color={theme.colors.mutedForeground} style={{ marginBottom: 12 }} />
              <Text
                style={[
                  styles.noResultsTitle,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                ]}
              >
                No results for "{query}"
              </Text>
              <Text
                style={[
                  styles.noResultsSubtitle,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                Try searching for a note, amount, account, category, or merchant.
              </Text>
            </View>
          ) : (
            /* Grouped Results */
            <View style={styles.resultsContainer}>
              {searchResults.groups.map((group) => (
                <View key={group.kind} style={styles.resultGroup}>
                  <Text
                    style={[
                      styles.groupTitle,
                      { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    {group.title.toUpperCase()}
                  </Text>
                  <View style={styles.groupItemList}>
                    {group.items.map((item) => {
                      const itemIndex = globalFlatCursor++;
                      const isFocused = itemIndex === activeIndex;

                      return (
                        <Pressable
                          key={item.id}
                          style={({ pressed }) => [
                            styles.resultItem,
                            isFocused && {
                              backgroundColor: theme.colors.muted,
                            },
                            pressed && styles.pressed,
                          ]}
                          onPress={() => handleSelectResult(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.title}, ${item.subtitle ?? ""}`}
                        >
                          <View
                            style={[
                              styles.itemIconContainer,
                              { backgroundColor: theme.colors.muted },
                            ]}
                          >
                            {renderIconForKind(item.kind, item.isIncome)}
                          </View>

                          <View style={styles.itemTextContainer}>
                            <HighlightedText
                              text={item.title}
                              query={query}
                              style={[
                                styles.itemTitle,
                                {
                                  color: theme.colors.foreground,
                                  fontFamily: theme.fontFamily.medium,
                                },
                              ]}
                              highlightStyle={[
                                styles.highlight,
                                { color: theme.colors.primary, fontFamily: theme.fontFamily.bold },
                              ]}
                              numberOfLines={1}
                            />
                            {item.subtitle ? (
                              <HighlightedText
                                text={item.subtitle}
                                query={query}
                                style={[
                                  styles.itemSubtitle,
                                  {
                                    color: theme.colors.mutedForeground,
                                    fontFamily: theme.fontFamily.regular,
                                  },
                                ]}
                                highlightStyle={[
                                  styles.highlight,
                                  { color: theme.colors.primary },
                                ]}
                                numberOfLines={1}
                              />
                            ) : null}
                          </View>

                          {item.amount !== undefined ? (
                            <View style={styles.amountContainer}>
                              <Text
                                style={[
                                  styles.amountText,
                                  {
                                    color: item.isIncome
                                      ? theme.colors.success
                                      : item.kind === "account"
                                        ? item.amount < 0
                                          ? theme.colors.destructive
                                          : theme.colors.foreground
                                        : theme.colors.destructive,
                                    fontFamily: theme.fontFamily.medium,
                                  },
                                ]}
                              >
                                {item.isIncome
                                  ? "+ "
                                  : item.kind === "transaction" || item.amount < 0
                                    ? "- "
                                    : ""}
                                {ghostMoney(Math.abs(item.amount))}
                              </Text>
                            </View>
                          ) : (
                            <ChevronRight size={16} color={theme.colors.mutedForeground} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Deep Link to Search & Lab if matching transactions exist */}
              {searchResults.totalTransactionMatches > 0 && (
                <Pressable
                  style={({ pressed }) => [
                    styles.searchLabBanner,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.card,
                    },
                    pressed && styles.pressed,
                  ]}
                  onPress={handleNavigateToSearchLab}
                >
                  <Sparkles size={16} color={theme.colors.primary} />
                  <Text
                    style={[
                      styles.searchLabText,
                      { color: theme.colors.primary, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    View all {searchResults.totalTransactionMatches} matching transactions in Search & Lab
                  </Text>
                  <ArrowRight size={14} color={theme.colors.primary} />
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </ModalContent>
    </GluestackModal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    minHeight: 380,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
    paddingHorizontal: 0,
    outlineStyle: "none",
  } as any,
  headerButton: {
    padding: 6,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  escText: {
    fontSize: 12,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 24,
  },
  emptyContainer: {
    gap: 20,
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionHeaderTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  clearAllText: {
    fontSize: 12,
  },
  recentWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  recentChipMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  recentChipText: {
    fontSize: 13,
  },
  recentChipRemove: {
    paddingVertical: 6,
    paddingRight: 8,
    paddingLeft: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  quickActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: 13,
  },
  noResultsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  noResultsTitle: {
    fontSize: 16,
    marginBottom: 6,
    textAlign: "center",
  },
  noResultsSubtitle: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },
  resultsContainer: {
    gap: 16,
  },
  resultGroup: {
    gap: 6,
  },
  groupTitle: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 8,
    marginBottom: 2,
  },
  groupItemList: {
    gap: 2,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 12,
  },
  itemIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTextContainer: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
  },
  itemSubtitle: {
    fontSize: 12,
  },
  highlight: {
    fontWeight: "700",
  },
  amountContainer: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 14,
  },
  searchLabBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  searchLabText: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.72,
  },
});
