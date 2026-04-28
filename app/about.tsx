import { View, Text, TouchableOpacity, ScrollView, Alert, Linking } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const utils = trpc.useUtils();
  const deleteMyDataMutation = trpc.contracts.deleteMyData.useMutation();

  const handleDeleteData = () => {
    Alert.alert(
      t("about.delete_title"),
      t("about.delete_confirm"),
      [
        { text: t("about.delete_cancel"), style: "cancel" },
        {
          text: t("about.delete_action"),
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              const result = await deleteMyDataMutation.mutateAsync();
              await utils.contracts.list.invalidate();
              Alert.alert(
                t("about.delete_success_title"),
                t("about.delete_success_body", {
                  contracts: result.contractsDeleted,
                  analyses: result.analysesDeleted,
                }),
              );
            } catch (error: any) {
              Alert.alert(t("about.delete_fail_title"), error?.message || t("about.delete_fail_body"));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const openExternalPolicy = async (url: string, labelKey: "about.privacy_policy" | "about.terms_of_use") => {
    const label = t(labelKey);
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert(label, t("about.url_not_configured", { label }));
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(label, t("about.url_open_failed", { label: label.toLowerCase() }));
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
            <Text className="text-3xl font-bold text-foreground">{t("about.title")}</Text>
          </View>

          {/* Legal Disclaimer */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <View className="flex-row items-start gap-3 mb-3">
              <IconSymbol size={24} name="exclamationmark.triangle.fill" color={colors.warning} />
              <Text className="flex-1 text-lg font-bold text-foreground">{t("about.not_legal_advice")}</Text>
            </View>
            <Text className="text-sm text-muted leading-relaxed">
              {t("about.not_legal_advice_body")}
            </Text>
          </View>

          {/* Data Handling */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <Text className="text-lg font-bold text-foreground mb-4">{t("about.data_handling")}</Text>

            <View className="gap-4">
              <View>
                <Text className="text-base font-semibold text-foreground mb-1">{t("about.what_we_upload")}</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  {t("about.what_we_upload_body")}
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">{t("about.data_retention")}</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  {t("about.data_retention_body")}
                </Text>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-1">{t("about.security")}</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  {t("about.security_body")}
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
              {isDeleting ? t("about.deleting") : t("about.delete_data")}
            </Text>
          </TouchableOpacity>

          {/* Legal Links */}
          <TouchableOpacity
            className="py-2"
            style={{ opacity: 1 }}
            onPress={() => openExternalPolicy(privacyPolicyUrl, "about.privacy_policy")}
          >
            <Text className="text-center font-semibold" style={{ color: colors.primary }}>
              {t("about.view_privacy")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-2"
            style={{ opacity: 1 }}
            onPress={() => openExternalPolicy(termsOfUseUrl, "about.terms_of_use")}
          >
            <Text className="text-center font-semibold" style={{ color: colors.primary }}>
              {t("about.view_terms")}
            </Text>
          </TouchableOpacity>

          {/* App Info */}
          <View className="items-center mt-4">
            <Text className="text-sm text-muted">{t("about.app_version")}</Text>
            <Text className="text-xs text-muted mt-1">{t("about.copyright")}</Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
