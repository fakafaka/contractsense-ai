import { Text, View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export default function WelcomeScreen() {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <ScreenContainer className="p-8">
      <View className="flex-1 items-center justify-center gap-12 max-w-md self-center">
        {/* App Name */}
        <View className="items-center gap-4">
          <Text className="text-5xl font-bold text-foreground text-center">
            ContractSense AI
          </Text>
          <Text className="text-xl text-muted text-center">
            {t("welcome.tagline")}
          </Text>
        </View>

        {/* Disclaimer */}
        <View className="bg-surface rounded-2xl p-6 border border-border w-full">
          <Text className="text-base font-semibold text-foreground mb-3 text-center">
            {t("welcome.disclaimer_title")}
          </Text>
          <Text className="text-sm text-muted leading-relaxed text-center">
            {t("welcome.disclaimer_body")}
          </Text>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity
          className="bg-primary px-10 py-5 rounded-full w-full"
          style={{ opacity: 1 }}
          onPress={() => router.push("/upload" as any)}
        >
          <Text className="text-white font-bold text-xl text-center">{t("welcome.get_started")}</Text>
        </TouchableOpacity>

        {/* About & Privacy Link */}
        <TouchableOpacity
          className="py-3"
          style={{ opacity: 1 }}
          onPress={() => router.push("/about" as any)}
        >
          <Text className="text-center font-semibold" style={{ color: colors.primary }}>
            {t("welcome.about_privacy")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
