import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function HistoryScreen() {
  const colors = useColors();
  
  const { data: contracts, isLoading } = trpc.contracts.list.useQuery();

  return (
    <ScreenContainer className="p-6">
      <View className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-3xl font-bold text-foreground">History</Text>
          <TouchableOpacity
            style={{ opacity: 1 }}
            onPress={() => router.push("/upload" as any)}
          >
            <Text className="text-base font-semibold" style={{ color: colors.primary }}>
              + New
            </Text>
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !contracts || contracts.length === 0 ? (
          /* Empty State */
          <View className="flex-1 items-center justify-center">
            <IconSymbol size={64} name="clock.fill" color={colors.muted} />
            <Text className="text-xl font-semibold text-foreground mt-4 text-center">
              No analyses yet
            </Text>
            <Text className="text-sm text-muted mt-2 text-center max-w-xs">
              Start by analyzing your first contract
            </Text>
            <TouchableOpacity
              className="bg-primary px-6 py-3 rounded-full mt-6"
              style={{ opacity: 1 }}
              onPress={() => router.push("/upload" as any)}
            >
              <Text className="text-white font-semibold">Analyze Contract</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Contract List */
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View className="gap-3">
              {contracts.map((item) => (
                <TouchableOpacity
                  key={item.contract.id}
                  className="bg-surface rounded-xl border border-border p-5"
                  style={{ opacity: 1 }}
                  onPress={() => {
                    const analysisId = item.analysis?.id;
                    console.log("History tap", analysisId);
                    if (analysisId) {
                      router.push(`/analysis/${analysisId}` as any);
                    } else {
                      console.warn("No analysisId found for contract:", item.contract.id);
                    }
                  }}
                >
                  <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
                    {item.contract.name}
                  </Text>
                  <Text className="text-sm text-muted mt-2">
                    {new Date(item.contract.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}
