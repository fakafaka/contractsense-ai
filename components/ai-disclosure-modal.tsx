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
import { useColors } from "@/hooks/use-colors";

// Resolved once at module load so every render doesn't re-read the config
const privacyPolicyUrl =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined)?.trim() || "";

type Props = {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
};

/**
 * One-time AI data disclosure modal required by Apple Guideline 5.1.1(i) /
 * 5.1.2(i). Tells the user that contract text is sent to OpenAI and asks for
 * explicit agreement before the first analysis.
 *
 * Show when `useAiConsent().hasConsented === false`.
 * Call `onAgree` → `grantConsent()` when the user taps "I Agree".
 * Call `onDecline` when they tap "No Thanks" (dismiss + don't proceed).
 */
export function AiDisclosureModal({ visible, onAgree, onDecline }: Props) {
  const colors = useColors();

  const handleOpenPrivacyPolicy = async () => {
    if (!privacyPolicyUrl || !/^https?:\/\//i.test(privacyPolicyUrl)) {
      Alert.alert("Privacy Policy", "Privacy policy URL is not configured yet.");
      return;
    }
    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch {
      Alert.alert("Privacy Policy", "Failed to open the privacy policy. Please try again.");
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
            AI Analysis Disclosure
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muted,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            Please read before your first analysis
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
                heading="What is shared"
                body="To generate your analysis, the text of your uploaded contract is sent to OpenAI's API. OpenAI processes this data on their servers."
                colors={colors}
              />
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <DisclosureRow
                icon="🚫"
                heading="What we don't do"
                body="We do not sell your contract data. Your documents are not used to train AI models. Data is transmitted over an encrypted connection."
                colors={colors}
              />
              <View style={{ height: 1, backgroundColor: colors.border }} />
              <DisclosureRow
                icon="📋"
                heading="Your control"
                body='You can delete all your data at any time from the About screen. Tapping "No Thanks" will cancel this analysis.'
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
                Read our full Privacy Policy →
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
                I Agree — Analyze My Contract
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
                No Thanks
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
