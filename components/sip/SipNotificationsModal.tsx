import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList } from "react-native";
import { AppNotification } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react-native";

export type SipNotificationsModalProps = {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
};

export function SipNotificationsModal({
  visible,
  onClose,
  notifications,
  onMarkAsRead,
  onClearAll,
}: SipNotificationsModalProps) {
  const { theme } = useTheme();

  const getIcon = (type: AppNotification["type"]) => {
    switch (type) {
      case "sip_executed":
        return <CheckCircle size={20} color={theme.colors.success} />;
      case "sip_failed":
      case "sip_skipped":
        return <AlertCircle size={20} color={theme.colors.destructive} />;
      default:
        return <Info size={20} color={theme.colors.primary} />;
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        {
          backgroundColor: item.read ? theme.colors.card : theme.colors.primary + "10",
          borderColor: theme.colors.border,
        },
      ]}
      onPress={() => {
        if (!item.read) onMarkAsRead(item.id);
      }}
      disabled={item.read}
    >
      <View style={styles.iconContainer}>{getIcon(item.type)}</View>
      <View style={styles.textContainer}>
        <Text
          style={[
            styles.title,
            { color: theme.colors.foreground, fontWeight: item.read ? "500" : "700" },
          ]}
        >
          {item.title}
        </Text>
        <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>{item.body}</Text>
      </View>
      {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>Notifications</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeButton}
            >
              <X size={24} color={theme.colors.foreground} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={{ color: theme.colors.mutedForeground, textAlign: "center", marginTop: 40 }}>
                No notifications.
              </Text>
            }
          />

          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button
              variant="outline"
              onPress={onClearAll}
              disabled={notifications.length === 0}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Clear All</Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    height: "80%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 4,
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
    marginTop: 6,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
});
