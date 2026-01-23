import { Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { startOAuthLogin } from "@/constants/oauth";

export default function LoginScreen() {
  const colors = useColors();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/" as any);
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    try {
      await startOAuthLogin();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6 items-center justify-center">
      <View className="items-center gap-8 max-w-sm w-full">
        {/* App Logo */}
        <View
          className="w-32 h-32 rounded-3xl items-center justify-center"
          style={{ backgroundColor: colors.primary }}
        >
          <IconSymbol size={64} name="doc.text.fill" color={colors.background} />
        </View>

        {/* App Name and Tagline */}
        <View className="items-center gap-3">
          <Text className="text-4xl font-bold text-foreground text-center">ContractSense AI</Text>
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

        {/* Login Button */}
        <TouchableOpacity
          className="bg-primary px-8 py-4 rounded-full w-full"
          style={{ opacity: 1 }}
          onPress={handleLogin}
        >
          <Text className="text-white font-bold text-lg text-center">Sign In with Manus</Text>
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text className="text-sm text-muted text-center mt-4">
          This is not legal advice. Consult a lawyer for legal guidance.
        </Text>
      </View>
    </ScreenContainer>
  );
}
