import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, Switch } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeContext } from "@/lib/theme-provider";

export default function ProfileScreen() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const { setColorScheme } = useThemeContext();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const { data: usage } = trpc.contracts.getUsage.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/" as any);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleDarkMode = () => {
    const newScheme = colorScheme === "dark" ? "light" : "dark";
    setColorScheme(newScheme);
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <ScreenContainer className="p-6 items-center justify-center">
        <View className="items-center gap-4">
          <Text className="text-xl font-semibold text-foreground">Please sign in</Text>
          <TouchableOpacity
            className="bg-primary px-6 py-3 rounded-full"
            style={{ opacity: 1 }}
            onPress={() => router.push("/login" as any)}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <Text className="text-3xl font-bold text-foreground">Profile</Text>

          {/* User Info Card */}
          <View className="bg-surface rounded-2xl p-6 border border-border">
            <View className="items-center mb-4">
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-3"
                style={{ backgroundColor: colors.primary + "20" }}
              >
                <Text className="text-3xl font-bold" style={{ color: colors.primary }}>
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </Text>
              </View>
              <Text className="text-xl font-semibold text-foreground">
                {user?.name || "User"}
              </Text>
              {user?.email && (
                <Text className="text-sm text-muted mt-1">{user.email}</Text>
              )}
            </View>
          </View>

          {/* Subscription Section */}
          <View>
            <Text className="text-lg font-semibold text-foreground mb-3">Subscription</Text>
            <View className="bg-surface rounded-2xl p-5 border border-border">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-base text-foreground">Current Plan</Text>
                <Text className="text-base font-semibold text-foreground">
                  {usage?.plan === "free" ? "Free" : "Premium"}
                </Text>
              </View>
              {usage && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-base text-foreground">Usage This Month</Text>
                  <Text className="text-base font-semibold text-foreground">
                    {usage.analysesThisMonth} / {usage.limit === -1 ? "∞" : usage.limit}
                  </Text>
                </View>
              )}
              {usage?.plan === "free" && (
                <TouchableOpacity
                  className="bg-primary px-4 py-3 rounded-xl mt-4"
                  style={{ opacity: 1 }}
                  onPress={() => {
                    // In production, this would navigate to upgrade flow
                    alert("Upgrade to Premium for unlimited analyses!");
                  }}
                >
                  <Text className="text-white font-semibold text-center">
                    Upgrade to Premium
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Preferences Section */}
          <View>
            <Text className="text-lg font-semibold text-foreground mb-3">Preferences</Text>
            <View className="bg-surface rounded-2xl border border-border overflow-hidden">
              <View className="px-5 py-4 flex-row items-center justify-between">
                <Text className="text-base text-foreground">Dark Mode</Text>
                <Switch
                  value={colorScheme === "dark"}
                  onValueChange={toggleDarkMode}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.background}
                />
              </View>
            </View>
          </View>

          {/* About Section */}
          <View>
            <Text className="text-lg font-semibold text-foreground mb-3">About</Text>
            <View className="bg-surface rounded-2xl border border-border overflow-hidden">
              <TouchableOpacity
                className="px-5 py-4 border-b border-border flex-row items-center justify-between"
                style={{ opacity: 1 }}
                onPress={() => {
                  // In production, navigate to about page
                  alert("ContractSense AI v1.0.0");
                }}
              >
                <Text className="text-base text-foreground">App Version</Text>
                <Text className="text-base text-muted">1.0.0</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="px-5 py-4 border-b border-border flex-row items-center justify-between"
                style={{ opacity: 1 }}
                onPress={() => {
                  // In production, navigate to privacy policy
                  alert("Privacy Policy");
                }}
              >
                <Text className="text-base text-foreground">Privacy Policy</Text>
                <IconSymbol size={20} name="chevron.right" color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                className="px-5 py-4 flex-row items-center justify-between"
                style={{ opacity: 1 }}
                onPress={() => {
                  // In production, navigate to terms of service
                  alert("Terms of Service");
                }}
              >
                <Text className="text-base text-foreground">Terms of Service</Text>
                <IconSymbol size={20} name="chevron.right" color={colors.muted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Disclaimer */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <View className="flex-row items-start gap-3">
              <IconSymbol size={20} name="exclamationmark.triangle.fill" color={colors.warning} />
              <Text className="flex-1 text-sm text-muted leading-relaxed">
                This app provides contract analysis for informational purposes only and does not
                constitute legal advice. Please consult with a qualified attorney for legal
                guidance.
              </Text>
            </View>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            className="rounded-2xl px-6 py-4 border-2 mb-8"
            style={{ opacity: 1, borderColor: colors.error }}
            onPress={handleLogout}
          >
            <Text className="text-center font-semibold text-base" style={{ color: colors.error }}>
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
