import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  Bot,
  CornerDownLeft,
  RotateCcw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  buildAdvisorContext,
  generateAdvisorResponse,
  type ChatMessage,
} from "@/services/aiAdvisorService";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

const INITIAL_SUGGESTIONS = [
  "How much did I spend on food this month?",
  "Where am I spending the most?",
  "Can I spend ₹3,000 this weekend?",
  "Analyze my monthly spending",
  "Where can I find savings?",
];

export function AiAdvisorView() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const { settings } = useSettings();
  const { user, isDuress } = useAuth();

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storageKey = useMemo(
    () => `ai_advisor_chat_${user?.uid || "guest"}_${isDuress ? "duress" : "real"}`,
    [user?.uid, isDuress]
  );

  // Financial Context
  const context = useMemo(
    () =>
      buildAdvisorContext(
        expenses,
        incomes,
        system.defaultCurrency,
        settings.monthlyBudget
      ),
    [expenses, incomes, system.defaultCurrency, settings.monthlyBudget]
  );

  // Load chat history from AsyncStorage
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((saved) => {
      if (cancelled) return;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            return;
          }
        } catch {}
      }

      // Initial welcome message
      const welcomeMsg: ChatMessage = {
        id: "welcome",
        role: "assistant",
        content:
          `Hello! I am your **AI Financial Advisor**.\n\n` +
          `I have analyzed your **${context.currentMonth}** records with **${system.defaultCurrency} ${context.totalExpenses.toLocaleString()}** in expenses.\n\n` +
          `How can I assist your financial planning today?`,
        timestamp: Date.now(),
        quickActions: INITIAL_SUGGESTIONS.slice(0, 3),
      };
      setMessages([welcomeMsg]);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, context.currentMonth, context.totalExpenses, system.defaultCurrency]);

  // Clear any pending "typing" response timer if the view unmounts mid-response
  // (e.g. the user switches tabs away from Advisor before the reply arrives).
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const saveHistory = async (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(newMessages));
    } catch {}
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    Haptics.selectionAsync().catch(() => undefined);
    setInputText("");

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const updatedHistory = [...messages, userMsg];
    await saveHistory(updatedHistory);
    setIsTyping(true);

    // Simulate conversational intelligence delay
    typingTimerRef.current = setTimeout(async () => {
      typingTimerRef.current = null;
      const response = await generateAdvisorResponse(
        text,
        context,
        updatedHistory
      );
      setIsTyping(false);
      await saveHistory([...updatedHistory, response]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
    }, 650);
  };

  const handleClearHistory = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined
    );
    await AsyncStorage.removeItem(storageKey);
    const welcomeMsg: ChatMessage = {
      id: `welcome_${Date.now()}`,
      role: "assistant",
      content: `Chat history cleared. How can I help you today?`,
      timestamp: Date.now(),
      quickActions: INITIAL_SUGGESTIONS.slice(0, 3),
    };
    setMessages([welcomeMsg]);
  };

  return (
    <View style={styles.container}>
      {/* Financial Health Summary Banner */}
      <Card style={styles.summaryBar}>
        <View style={styles.summaryLeft}>
          <View
            style={[
              styles.botIconCircle,
              {
                backgroundColor: isDark
                  ? "rgba(99,102,241,0.2)"
                  : "rgba(99,102,241,0.1)",
              },
            ]}
          >
            <Bot size={20} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.summaryTitle, { color: theme.colors.foreground }]}>
              {context.smartInsight.title}
            </Text>
            <Text
              style={[styles.summaryDesc, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {context.smartInsight.description}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleClearHistory}
          style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.6 }]}
        >
          <RotateCcw size={16} color={theme.colors.mutedForeground} />
        </Pressable>
      </Card>

      {/* Messages Stream */}
      <View style={styles.messagesWrapper}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View
                style={[
                  styles.messageBubbleContainer,
                  isUser ? styles.userBubbleAlign : styles.assistantBubbleAlign,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    {
                      backgroundColor: isUser
                        ? theme.colors.primary
                        : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      borderColor: isUser ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      { color: isUser ? "#FFFFFF" : theme.colors.foreground },
                    ]}
                  >
                    {item.content}
                  </Text>

                  {/* Highlight metric card */}
                  {item.highlightCard && (
                    <View
                      style={[
                        styles.highlightBox,
                        {
                          backgroundColor:
                            item.highlightCard.type === "positive"
                              ? isDark
                                ? "rgba(34,197,94,0.15)"
                                : "rgba(34,197,94,0.1)"
                              : isDark
                              ? "rgba(245,158,11,0.15)"
                              : "rgba(245,158,11,0.1)",
                          borderColor:
                            item.highlightCard.type === "positive"
                              ? "rgba(34,197,94,0.3)"
                              : "rgba(245,158,11,0.3)",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          textTransform: "uppercase",
                          color:
                            item.highlightCard.type === "positive"
                              ? "#22C55E"
                              : "#F59E0B",
                        }}
                      >
                        {item.highlightCard.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "900",
                          color: theme.colors.foreground,
                        }}
                      >
                        {item.highlightCard.value}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Quick Action Pills on last assistant response */}
                {item.quickActions && item.quickActions.length > 0 && (
                  <View style={styles.quickActionsRow}>
                    {item.quickActions.map((qa: string, qidx: number) => (
                      <Pressable
                        key={qidx}
                        onPress={() => handleSendMessage(qa)}
                        style={({ pressed }) => [
                          styles.actionPill,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            borderColor: theme.colors.border,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.actionPillText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {qa}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={{ fontSize: 12, color: theme.colors.mutedForeground }}>
                  Advisor is analyzing your finances...
                </Text>
              </View>
            ) : null
          }
        />
      </View>

      {/* Suggested Questions Horizontal Bar */}
      <HorizontalSwipeBoundary>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsScroll}
        >
          {INITIAL_SUGGESTIONS.map((sug, idx) => (
            <Pressable
              key={idx}
              onPress={() => handleSendMessage(sug)}
              style={({ pressed }) => [
                styles.suggestionChip,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.03)",
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Sparkles size={12} color={theme.colors.primary} />
              <Text
                style={[
                  styles.suggestionChipText,
                  { color: theme.colors.foreground },
                ]}
                numberOfLines={1}
              >
                {sug}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </HorizontalSwipeBoundary>

      {/* Message Input Strip */}
      <View
        style={[
          styles.inputStrip,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask advice, budget checks, savings tips..."
          placeholderTextColor={theme.colors.mutedForeground}
          style={[styles.chatInput, { color: theme.colors.foreground }]}
          onSubmitEditing={() => handleSendMessage()}
          returnKeyType="send"
        />

        <Pressable
          onPress={() => handleSendMessage()}
          disabled={!inputText.trim() || isTyping}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: inputText.trim()
                ? theme.colors.primary
                : isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.08)",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Send
            size={16}
            color={inputText.trim() ? "#FFFFFF" : theme.colors.mutedForeground}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 16,
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  botIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  summaryDesc: {
    fontSize: 11,
  },
  resetBtn: {
    padding: 8,
    borderRadius: 10,
  },
  messagesWrapper: {
    height: 380,
    borderRadius: 18,
    overflow: "hidden",
  },
  messagesList: {
    paddingVertical: 10,
    gap: 12,
  },
  messageBubbleContainer: {
    gap: 6,
  },
  userBubbleAlign: {
    alignItems: "flex-end",
  },
  assistantBubbleAlign: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "86%",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  highlightBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionsScroll: {
    flexDirection: "row",
    gap: 6,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  inputStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
  },
  chatInput: {
    flex: 1,
    fontSize: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
