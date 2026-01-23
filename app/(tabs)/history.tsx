import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator, TextInput } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function HistoryScreen() {
  const colors = useColors();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: contracts, isLoading, refetch } = trpc.contracts.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const deleteMutation = trpc.contracts.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
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

  // Filter contracts based on search query
  const filteredContracts = contracts?.filter((item) =>
    item.contract.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleDelete = async (contractId: number) => {
    try {
      await deleteMutation.mutateAsync({ contractId });
    } catch (error) {
      console.error("Failed to delete contract:", error);
    }
  };

  return (
    <ScreenContainer className="p-6">
      <View className="flex-1">
        {/* Header */}
        <Text className="text-3xl font-bold text-foreground mb-6">Analysis History</Text>

        {/* Search Bar */}
        <View className="bg-surface rounded-xl px-4 py-3 border border-border mb-4 flex-row items-center">
          <IconSymbol size={20} name="chevron.right" color={colors.muted} />
          <TextInput
            className="flex-1 ml-2 text-foreground"
            placeholder="Search contracts..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Loading State */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredContracts.length === 0 ? (
          /* Empty State */
          <View className="flex-1 items-center justify-center">
            <IconSymbol size={64} name="clock.fill" color={colors.muted} />
            <Text className="text-xl font-semibold text-foreground mt-4 text-center">
              {searchQuery ? "No contracts found" : "No analyses yet"}
            </Text>
            <Text className="text-sm text-muted mt-2 text-center max-w-xs">
              {searchQuery
                ? "Try a different search term"
                : "Start by analyzing your first contract"}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                className="bg-primary px-6 py-3 rounded-full mt-6"
                style={{ opacity: 1 }}
                onPress={() => router.push("/upload" as any)}
              >
                <Text className="text-white font-semibold">Analyze Contract</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          /* Contract List */
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View className="gap-3">
              {filteredContracts.map((item) => (
                <View key={item.contract.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                  <TouchableOpacity
                    className="p-4"
                    style={{ opacity: 1 }}
                    onPress={() =>
                      router.push(`/analysis/${item.analysis?.id}` as any)
                    }
                  >
                    <View className="flex-row items-start justify-between mb-2">
                      <Text className="text-base font-semibold text-foreground flex-1 mr-2" numberOfLines={2}>
                        {item.contract.name}
                      </Text>
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
                    </View>
                    <Text className="text-sm text-muted">
                      {new Date(item.contract.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Delete Button */}
                  <TouchableOpacity
                    className="px-4 py-3 border-t border-border"
                    style={{ opacity: 1, backgroundColor: colors.error + "10" }}
                    onPress={() => handleDelete(item.contract.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Text className="text-center font-semibold" style={{ color: colors.error }}>
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}
