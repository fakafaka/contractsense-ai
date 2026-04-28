import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { useColors } from "@/hooks/use-colors";

// Resolved once at module load so every render doesn't re-read the config
const privacyPolicyUrl =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined)?.trim() || "";

type Props = {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
};

export function AiDisclosureModal({ visible, onAgree, onDecline }: Props) {
  const colors = useColors();
  const { t } = useTranslation();

  const handleOpenPrivacyPolicy = async () => {
    if (!privacyPolicyUrl || !/^https?:\/\//i.test(privacyPolicyUrl)) {
      Alert.alert(t("disclosure.title"), t("disclosure.privacy_not_configured"));
      return;
    }
    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch {
      Alert.alert(t("disclosure.title"), t("disclosure.privacy_open_failed"));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDecline}
    >
      {/* Dim overlay */}
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        {/* Card */}
        <View
          style={{
            backgroundColor: colors.background,
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 420,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          {/* Icon + title */}
          <Text
            style={{
              fontSize: 32,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            🔒
          </Text>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: colors.foreground,
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {t("disclosure.title")}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muted,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            {t("disclosure.subtitle")}
          </Text>

          <ScrollView
            style={{ maxHeight: 220 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Main disclosure */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: 16,
                gap: 12,
              }}
            >
              <DisclosureRow
                icon="📤"
                heading={t("disclosure.shared_heading")}
                body={t("disclosure.shared_body")}
                colors={colors}
              />
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <DisclosureRow
                icon="🚫"
                heading={t("disclosure.no_sell_heading")}
                body={t("disclosure.no_sell_body")}
                colors={colors}
              />
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <DisclosureRow
                icon="📋"
                heading={t("disclosure.control_heading")}
                body={t("disclosure.control_body")}
                colors={colors}
              />
            </View>

            {/* Privacy policy link */}
            <TouchableOpacity
              onPress={handleOpenPrivacyPolicy}
              style={{ alignItems: "center", marginBottom: 4 }}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.primary,
                  textDecorationLine: "underline",
                  fontWeight: "500",
                }}
              >
                {t("disclosure.privacy_link")}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Buttons */}
          <View style={{ gap: 10, marginTop: 20 }}>
            <TouchableOpacity
              onPress={onAgree}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontWeight: "700",
                  fontSize: 16,
                }}
              >
                {t("disclosure.agree")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDecline}
              activeOpacity={0.85}
              style={{
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontWeight: "500",
                  fontSize: 15,
                }}
              >
                {t("disclosure.decline")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── tiny helper ──────────────────────────────────────────────────────────────

type RowProps = {
  icon: string;
  heading: string;
  body: string;
  colors: ReturnType<typeof useColors>;
};

function DisclosureRow({ icon, heading, body, colors }: RowProps) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <Text style={{ fontSize: 18, lineHeight: 24 }}>{icon}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: colors.foreground,
          }}
        >
          {heading}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            lineHeight: 19,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
