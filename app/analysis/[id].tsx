import { ScrollView, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function AnalysisScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams();
  const analysisId = parseInt(id as string);

  const { data, isLoading, error } = trpc.contracts.getAnalysis.useQuery(
    { analysisId },
    { enabled: !isNaN(analysisId) }
  );

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (error || !data) {
    return (
      <ScreenContainer className="p-6 items-center justify-center">
        <IconSymbol size={64} name="xmark.circle.fill" color={colors.error} />
        <Text className="text-xl font-semibold text-foreground mt-4 text-center">
          Analysis Not Found
        </Text>
        <Text className="text-sm text-muted mt-2 text-center">
          {error?.message || "Unable to load analysis"}
        </Text>
        <TouchableOpacity
          className="bg-primary px-6 py-3 rounded-full mt-6"
          style={{ opacity: 1 }}
          onPress={() => router.back()}
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const { contract, analysis } = data;

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-6">
          {/* Header */}
          <View className="flex-row items-center gap-3 mb-2">
            <TouchableOpacity style={{ opacity: 1 }} onPress={() => router.back()}>
              <IconSymbol
                size={24}
                name="chevron.right"
                color={colors.foreground}
                style={{ transform: [{ rotate: "180deg" }] }}
              />
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-foreground flex-1" numberOfLines={2}>
              {contract?.name}
            </Text>
          </View>

          {/* Date */}
          <Text className="text-sm text-muted">
            {contract && new Date(contract.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>

          {/* Summary Section */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <View className="flex-row items-center gap-3 mb-3">
              <IconSymbol size={24} name="doc.text.fill" color={colors.primary} />
              <Text className="text-lg font-bold text-foreground">What is this contract about?</Text>
            </View>
            <Text className="text-base text-foreground leading-relaxed">{analysis.summary}</Text>
          </View>

          {/* Main Obligations Section */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <View className="flex-row items-center gap-3 mb-3">
              <IconSymbol size={24} name="checkmark.circle.fill" color={colors.primary} />
              <Text className="text-lg font-bold text-foreground">Your main responsibilities</Text>
            </View>
            <View className="gap-3">
              {analysis.mainObligations.map((obligation: string, index: number) => (
                <View key={index} className="flex-row gap-3">
                  <Text className="text-base text-foreground">•</Text>
                  <Text className="flex-1 text-base text-foreground leading-relaxed">{obligation}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Potential Risks Section */}
          {analysis.potentialRisks && analysis.potentialRisks.length > 0 && (
            <View className="bg-surface rounded-2xl p-5 border border-border">
              <View className="flex-row items-center gap-3 mb-3">
                <IconSymbol size={24} name="exclamationmark.triangle.fill" color={colors.warning} />
                <Text className="text-lg font-bold text-foreground">What can go wrong</Text>
              </View>
              <View className="gap-4">
                {analysis.potentialRisks.map((risk: any, index: number) => (
                  <View key={index} className="gap-1">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            risk.severity === "low"
                              ? colors.success
                              : risk.severity === "medium"
                              ? colors.warning
                              : colors.error,
                        }}
                      />
                      <Text className="text-base font-semibold text-foreground">{risk.title}</Text>
                    </View>
                    <Text className="text-base text-muted leading-relaxed ml-4">{risk.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Red Flags Section */}
          {analysis.redFlags && analysis.redFlags.length > 0 && (
            <View className="rounded-2xl p-5 border-2" style={{ backgroundColor: colors.error + "10", borderColor: colors.error }}>
              <View className="flex-row items-center gap-3 mb-3">
                <IconSymbol size={24} name="xmark.circle.fill" color={colors.error} />
                <Text className="text-lg font-bold" style={{ color: colors.error }}>
                  Red flags to watch out for
                </Text>
              </View>
              <View className="gap-4">
                {analysis.redFlags.map((flag: any, index: number) => (
                  <View key={index} className="gap-1">
                    <Text className="text-sm font-semibold uppercase" style={{ color: colors.error }}>
                      {flag.category}
                    </Text>
                    <Text className="text-base font-semibold text-foreground">{flag.title}</Text>
                    <Text className="text-base text-foreground leading-relaxed">{flag.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Disclaimer Section */}
          <View className="bg-surface rounded-2xl p-5 border border-border">
            <View className="flex-row items-start gap-3">
              <IconSymbol size={20} name="exclamationmark.triangle.fill" color={colors.warning} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground mb-2">Important Disclaimer</Text>
                <Text className="text-sm text-muted leading-relaxed">
                  This analysis is for informational purposes only and does not constitute legal advice.
                  Only the first 10 pages of the provided document (or equivalent initial text section)
                  were analyzed.
                  Please consult with a qualified attorney for legal guidance regarding this contract.
                </Text>
              </View>
            </View>
          </View>

          {/* Navigation Buttons */}
          <View className="gap-3">
            <TouchableOpacity
              className="bg-primary px-6 py-4 rounded-full"
              style={{ opacity: 1 }}
              onPress={() => router.push("/history" as any)}
            >
              <Text className="text-white font-bold text-center">View All Analyses</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface px-6 py-4 rounded-full border border-border"
              style={{ opacity: 1 }}
              onPress={() => router.push("/upload" as any)}
            >
              <Text className="text-foreground font-bold text-center">Analyze Another Contract</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
