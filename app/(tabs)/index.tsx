import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function HomeScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { data: usage, isLoading: usageLoading } = trpc.contracts.getUsage.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: contracts, isLoading: contractsLoading } = trpc.contracts.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

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
        <View className="items-center gap-6 max-w-sm">
          <IconSymbol size={80} name="doc.text.fill" color={colors.primary} />
          <Text className="text-3xl font-bold text-foreground text-center">
            ContractSense AI
          </Text>
          <Text className="text-base text-muted text-center">
            Understand contracts in plain English
          </Text>
          <TouchableOpacity
            className="bg-primary px-8 py-4 rounded-full mt-4"
            style={{ opacity: 1 }}
            onPress={() => router.push("/login" as any)}
          >
            <Text className="text-white font-semibold text-base">Sign In to Get Started</Text>
          </TouchableOpacity>
          <Text className="text-sm text-muted text-center mt-4">
            This is not legal advice
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const recentContracts = contracts?.slice(0, 3) || [];
  const hasContracts = recentContracts.length > 0;

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Welcome Header */}
          <View>
            <Text className="text-3xl font-bold text-foreground">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </Text>
            <Text className="text-base text-muted mt-1">
              Understand your contracts in plain English
            </Text>
          </View>

          {/* Usage Stats Card */}
          {usageLoading ? (
            <View className="bg-surface rounded-2xl p-6 border border-border">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : usage ? (
            <View className="bg-surface rounded-2xl p-6 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-3">
                {usage.plan === "free" ? "Free Plan" : "Premium Plan"}
              </Text>
              {usage.plan === "free" ? (
                <>
                  <Text className="text-sm text-muted mb-2">
                    Analyses this month: {usage.analysesThisMonth} / {usage.limit}
                  </Text>
                  <View className="w-full h-2 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-full bg-primary"
                      style={{
                        width: `${(usage.analysesThisMonth / usage.limit) * 100}%`,
                      }}
                    />
                  </View>
                  {usage.remaining === 0 && (
                    <Text className="text-sm text-error mt-2">
                      You've reached your monthly limit. Upgrade to Premium for unlimited analyses.
                    </Text>
                  )}
                </>
              ) : (
                <Text className="text-sm text-muted">
                  Unlimited analyses • {usage.analysesThisMonth} analyzed this month
                </Text>
              )}
            </View>
          ) : null}

          {/* Main CTA Button */}
          <TouchableOpacity
            className="bg-primary px-6 py-4 rounded-2xl items-center"
            style={{ opacity: 1 }}
            onPress={() => router.push("/upload" as any)}
          >
            <Text className="text-white font-bold text-lg">Analyze New Contract</Text>
          </TouchableOpacity>

          {/* Recent Analyses */}
          {contractsLoading ? (
            <View className="mt-4">
              <Text className="text-xl font-semibold text-foreground mb-3">Recent Analyses</Text>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : hasContracts ? (
            <View className="mt-4">
              <Text className="text-xl font-semibold text-foreground mb-3">Recent Analyses</Text>
              <View className="gap-3">
                {recentContracts.map((item) => (
                  <TouchableOpacity
                    key={item.contract.id}
                    className="bg-surface rounded-xl p-4 border border-border flex-row items-center justify-between"
                    style={{ opacity: 1 }}
                    onPress={() =>
                      router.push(`/analysis/${item.analysis?.id}` as any)
                    }
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                        {item.contract.name}
                      </Text>
                      <Text className="text-sm text-muted mt-1">
                        {new Date(item.contract.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-2">
                      {item.analysis && (
                        <View
                          className="px-3 py-1 rounded-full"
                          style={{
                            backgroundColor:
                              item.analysis.riskLevel === "low"
                                ? colors.success + "20"
                                : item.analysis.riskLevel === "medium"
                                ? colors.warning + "20"
                                : colors.error + "20",
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{
                              color:
                                item.analysis.riskLevel === "low"
                                  ? colors.success
                                  : item.analysis.riskLevel === "medium"
                                  ? colors.warning
                                  : colors.error,
                            }}
                          >
                            {item.analysis.riskLevel.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <IconSymbol size={20} name="chevron.right" color={colors.muted} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View className="mt-4 bg-surface rounded-xl p-8 border border-border items-center">
              <IconSymbol size={48} name="doc.text.fill" color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground mt-4 text-center">
                No contracts analyzed yet
              </Text>
              <Text className="text-sm text-muted mt-2 text-center">
                Upload your first contract to get started
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
