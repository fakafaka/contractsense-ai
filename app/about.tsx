import { View, Text, TouchableOpacity, ScrollView, Alert, Linking } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const privacyPolicyUrl =
  (Constants.expoConfig?.extra?.privacyPolicyUrl as string | undefined)?.trim() || "";
const termsOfUseUrl =
  (Constants.expoConfig?.extra?.termsOfUseUrl as string | undefined)?.trim() || "";

export default function AboutScreen() {
  const colors = useColors();
  const [isDeleting, setIsDeleting] = useState(false);
  const utils = trpc.useUtils();
  const deleteMyDataMutation = trpc.contracts.deleteMyData.useMutation();

  const handleDeleteData = () => {
    Alert.alert(
      "Delete My Data",
      "This will permanently delete your uploaded contracts and analysis history now. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              const result = await deleteMyDataMutation.mutateAsync();
              await utils.contracts.list.invalidate();
              Alert.alert(
                "Data Deleted",
                `Deleted ${result.contractsDeleted} contracts and ${result.analysesDeleted} analyses.`,
              );
            } catch (error: any) {
              Alert.alert("Delete Failed", error?.message || "Unable to delete your data right now.");
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const openExternalPolicy = async (url: string, label: string) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert(label, `${label} URL is not configured yet.`);
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(label, `Failed to open ${label.toLowerCase()} URL.`);
    }
  };

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <View className="flex-row items-center gap-3">
            <TouchableOpacity style={{ opacity: 1 }} onPress={() => router.back()}>
              <IconSymbol
                size={24}
                name="chevron.right"
                color={colors.foreground}
                style={{ transform: [{ rotate: "180deg" }] }}
              />
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
              ContractSense AI provides contract analysis for informational purposes only. This service does not
              constitute legal advice, and should not be relied upon as a substitute for consultation with a qualified
              attorney. Always consult with a licensed legal professional for advice regarding contracts and legal
              matters.
            </Text>
          </View>

          {/* Data Handling */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-bold text-foreground mb-4">Data Handling</Text>

            <View className="gap-4">
              <View>
                <Text className="text-base font-semibold text-foreground mb-1">What We Upload</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  • Contract text or PDF files you submit{"\n"}• Contract names you provide{"\n"}• AI-generated
                  analysis results
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">Data Retention</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  Your uploaded contracts and analyses are automatically deleted after 24 hours. You can also manually
                  delete all your data at any time using the button below.
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">Security</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  All data is transmitted over encrypted connections (HTTPS). We do not share your contract data with
                  third parties.
                </Text>
              </View>
            </View>
          </View>

          {/* Delete Data Button */}
          <TouchableOpacity
            className="bg-error px-6 py-4 rounded-2xl"
            style={{ opacity: isDeleting ? 0.6 : 1 }}
            onPress={handleDeleteData}
            disabled={isDeleting}
          >
            <Text className="text-white font-bold text-lg text-center">
              {isDeleting ? "Deleting..." : "Delete My Data Now"}
            </Text>
          </TouchableOpacity>

          {/* Legal Links */}
          <TouchableOpacity className="py-2" style={{ opacity: 1 }} onPress={() => openExternalPolicy(privacyPolicyUrl, "Privacy Policy")}>
            <Text className="text-center font-semibold" style={{ color: colors.primary }}>
              View Privacy Policy
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="py-2" style={{ opacity: 1 }} onPress={() => openExternalPolicy(termsOfUseUrl, "Terms of Use")}>
            <Text className="text-center font-semibold" style={{ color: colors.primary }}>
              View Terms of Use
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
