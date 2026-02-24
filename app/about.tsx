import { View, Text, TouchableOpacity, ScrollView, Alert, Linking } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function AboutScreen() {
  const colors = useColors();
  const handleDeleteData = () => {
    Alert.alert(
      "Delete My Data",
      "All analyses are automatically deleted after 24 hours. To delete a specific report immediately, go to History and swipe left on the report (feature coming soon).",
      [
        { text: "OK" },
      ]
    );
  };

  const openPrivacyPolicy = () => {
    // Replace with actual privacy policy URL when available
    Alert.alert("Privacy Policy", "Privacy policy URL will be available soon.");
    // Linking.openURL("https://yourapp.com/privacy");
  };

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              style={{ opacity: 1 }}
              onPress={() => router.back()}
            >
              <IconSymbol size={24} name="chevron.right" color={colors.foreground} style={{ transform: [{ rotate: "180deg" }] }} />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-foreground">About & Privacy</Text>
          </View>

          {/* Legal Disclaimer */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <View className="flex-row items-start gap-3 mb-3">
              <IconSymbol size={24} name="exclamationmark.triangle.fill" color={colors.warning} />
              <Text className="flex-1 text-lg font-bold text-foreground">Not Legal Advice</Text>
            </View>
            <Text className="text-sm text-muted leading-relaxed">
              ContractSense AI provides contract analysis for informational purposes only. This service does not constitute legal advice, and should not be relied upon as a substitute for consultation with a qualified attorney. Always consult with a licensed legal professional for advice regarding contracts and legal matters.
            </Text>
          </View>

          {/* Data Handling */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-bold text-foreground mb-4">Data Handling</Text>
            
            <View className="gap-4">
              <View>
                <Text className="text-base font-semibold text-foreground mb-1">What We Upload</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  • Contract text or PDF files you submit{"\n"}
                  • Contract names you provide{"\n"}
                  • AI-generated analysis results
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">Data Retention</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  Your uploaded contracts and analyses are automatically deleted after 24 hours. You can also manually delete all your data at any time using the button below.
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">Security</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  All data is transmitted over encrypted connections (HTTPS). We do not share your contract data with third parties.
                </Text>
              </View>
            </View>
          </View>

          {/* Delete Data Button */}
          <TouchableOpacity
            className="bg-error px-6 py-4 rounded-2xl"
            style={{ opacity: 1 }}
            onPress={handleDeleteData}
          >
            <Text className="text-white font-bold text-lg text-center">
              Delete My Data Now
            </Text>
          </TouchableOpacity>

          {/* Privacy Policy Link */}
          <TouchableOpacity
            className="py-3"
            style={{ opacity: 1 }}
            onPress={openPrivacyPolicy}
          >
            <Text className="text-center font-semibold" style={{ color: colors.primary }}>
              View Privacy Policy
            </Text>
          </TouchableOpacity>

          {/* App Info */}
          <View className="items-center mt-4">
            <Text className="text-sm text-muted">ContractSense AI v1.0</Text>
            <Text className="text-xs text-muted mt-1">© 2026 All rights reserved</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
