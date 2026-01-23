import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function WelcomeScreen() {
  const colors = useColors();

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center gap-8 max-w-md self-center">
          {/* App Logo */}
          <View
            className="w-32 h-32 rounded-3xl items-center justify-center"
            style={{ backgroundColor: colors.primary }}
          >
            <IconSymbol size={64} name="doc.text.fill" color={colors.background} />
          </View>

          {/* App Name and Tagline */}
          <View className="items-center gap-3">
            <Text className="text-4xl font-bold text-foreground text-center">
              ContractSense AI
            </Text>
            <Text className="text-lg text-muted text-center">
              Understand contracts in plain English
            </Text>
          </View>

          {/* Features List */}
          <View className="w-full gap-4">
            <View className="flex-row items-center gap-3">
              <IconSymbol size={24} name="checkmark.circle.fill" color={colors.success} />
              <Text className="text-base text-foreground">AI-powered contract analysis</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <IconSymbol size={24} name="checkmark.circle.fill" color={colors.success} />
              <Text className="text-base text-foreground">Identify risks and red flags</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <IconSymbol size={24} name="checkmark.circle.fill" color={colors.success} />
              <Text className="text-base text-foreground">Plain English explanations</Text>
            </View>
          </View>

          {/* Main CTA Button */}
          <TouchableOpacity
            className="bg-primary px-8 py-4 rounded-full w-full"
            style={{ opacity: 1 }}
            onPress={() => router.push("/upload" as any)}
          >
            <Text className="text-white font-bold text-lg text-center">Analyze a Contract</Text>
          </TouchableOpacity>

          {/* Disclaimer */}
          <View className="bg-surface rounded-2xl p-5 border border-border w-full">
            <View className="flex-row items-start gap-3">
              <IconSymbol size={20} name="exclamationmark.triangle.fill" color={colors.warning} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground mb-2">
                  Important Disclaimer
                </Text>
                <Text className="text-sm text-muted leading-relaxed">
                  This analysis is for informational purposes only and does not constitute legal
                  advice. Please consult with a qualified attorney for legal guidance regarding
                  contracts.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
