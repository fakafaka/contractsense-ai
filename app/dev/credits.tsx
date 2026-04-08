import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { getApiBaseUrl } from "@/constants/oauth";
import { getOrCreateDeviceId } from "@/lib/device-id";

/**
 * Dev-only screen for managing credits during testing.
 * Calls /api/dev/add-credits which returns 404 in production.
 * Accessible from the About screen only when __DEV__ is true.
 */
export default function DevCreditsScreen() {
  const colors = useColors();
  const [isAdding, setIsAdding] = useState(false);
  const { data: usage, refetch, isLoading } = trpc.contracts.usageStatus.useQuery();

  const addCredits = async (amount: number) => {
    try {
      setIsAdding(true);
      const deviceId = await getOrCreateDeviceId();
      const response = await fetch(`${getApiBaseUrl()}/api/dev/add-credits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ credits: amount }),
      });
      const data = await response.json();
      if (data.success) {
        await refetch();
        Alert.alert("Done", `+${amount} credits added. Remaining: ${data.remainingCredits}`);
      } else {
        Alert.alert("Error", data.error || "Failed to add credits");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Request failed");
    } finally {
      setIsAdding(false);
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
            <Text className="text-2xl font-bold text-foreground">Dev: Credits</Text>
          </View>

          {/* Warning */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <Text className="text-base font-bold text-foreground mb-2">Dev/Testing Only</Text>
            <Text className="text-sm text-muted leading-relaxed">
              This screen is only visible in development builds ({"`__DEV__ === true`"}).{"\n"}
              The backend endpoint returns 404 in production.
            </Text>
          </View>

          {/* Credit state */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <Text className="text-base font-bold text-foreground mb-3">Current Credit State</Text>
            {isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : usage ? (
              <View className="gap-2">
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted">Remaining</Text>
                  <Text className="text-sm font-bold text-foreground">{usage.remainingCredits}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted">Total granted</Text>
                  <Text className="text-sm font-bold text-foreground">{usage.totalCredits}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted">Consumed</Text>
                  <Text className="text-sm font-bold text-foreground">{usage.creditsConsumed}</Text>
                </View>
              </View>
            ) : (
              <Text className="text-sm text-muted">Unable to load credit state</Text>
            )}
          </View>

          {/* Add credits buttons */}
          <View className="gap-3">
            {[1, 3, 5, 10].map((amount) => (
              <TouchableOpacity
                key={amount}
                className="bg-primary px-6 py-4 rounded-2xl"
                style={{ opacity: isAdding ? 0.6 : 1 }}
                disabled={isAdding}
                onPress={() => addCredits(amount)}
              >
                <Text className="text-white font-bold text-lg text-center">
                  {isAdding ? "Adding..." : `+ Add ${amount} credit${amount === 1 ? "" : "s"}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
