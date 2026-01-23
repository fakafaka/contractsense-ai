import { ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function UploadScreen() {
  const colors = useColors();
  const [uploadMethod, setUploadMethod] = useState<"pdf" | "text" | null>(null);
  const [pdfFile, setPdfFile] = useState<{ name: string; uri: string; size: number } | null>(null);
  const [contractText, setContractText] = useState("");
  const [contractName, setContractName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeTextMutation = trpc.contracts.analyzeText.useMutation();
  const analyzePDFMutation = trpc.contracts.analyzePDF.useMutation();

  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      
      // Check file size (10MB limit)
      if (file.size && file.size > 10 * 1024 * 1024) {
        Alert.alert("File Too Large", "PDF file must be less than 10MB");
        return;
      }

      setPdfFile({
        name: file.name,
        uri: file.uri,
        size: file.size || 0,
      });
      setContractName(file.name.replace(".pdf", ""));
      setUploadMethod("pdf");
    } catch (error) {
      console.error("Error picking PDF:", error);
      Alert.alert("Error", "Failed to pick PDF file");
    }
  };

  const handleRemovePDF = () => {
    setPdfFile(null);
    setContractName("");
    setUploadMethod(null);
  };

  const handleAnalyze = async () => {
    if (!contractName.trim()) {
      Alert.alert("Missing Name", "Please enter a contract name");
      return;
    }

    if (uploadMethod === "text" && contractText.trim().length < 10) {
      Alert.alert("Invalid Text", "Please enter at least 10 characters of contract text");
      return;
    }

    if (uploadMethod === "pdf" && !pdfFile) {
      Alert.alert("Missing File", "Please select a PDF file");
      return;
    }

    setIsAnalyzing(true);

    try {
      if (uploadMethod === "text") {
        const result = await analyzeTextMutation.mutateAsync({
          name: contractName.trim(),
          text: contractText.trim(),
        });
        
        // Navigate to analysis screen
        router.replace(`/analysis/${result.analysisId}` as any);
      } else if (uploadMethod === "pdf" && pdfFile) {
        // Read PDF file as base64
        const base64 = await FileSystem.readAsStringAsync(pdfFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const result = await analyzePDFMutation.mutateAsync({
          name: contractName.trim(),
          pdfBase64: base64,
          fileSize: pdfFile.size,
        });

        // Navigate to analysis screen
        router.replace(`/analysis/${result.analysisId}` as any);
      }
    } catch (error: any) {
      console.error("Analysis error:", error);
      Alert.alert("Analysis Failed", error.message || "Failed to analyze contract. Please try again.");
      setIsAnalyzing(false);
    }
  };

  // Processing Screen
  if (isAnalyzing) {
    return (
      <ScreenContainer className="p-6 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-2xl font-bold text-foreground mt-6">Analyzing Contract...</Text>
        <Text className="text-base text-muted mt-3 text-center max-w-xs">
          This may take 10-30 seconds
        </Text>
        <View className="mt-8 bg-surface rounded-xl p-5 border border-border max-w-sm">
          <Text className="text-sm text-muted text-center leading-relaxed">
            Our AI is reading your contract and identifying key terms, obligations, risks, and red flags.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 gap-6">
          {/* Header */}
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              style={{ opacity: 1 }}
              onPress={() => router.back()}
            >
              <IconSymbol size={24} name="chevron.right" color={colors.foreground} style={{ transform: [{ rotate: "180deg" }] }} />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-foreground">Upload Contract</Text>
          </View>

          {/* Upload Method Selection */}
          {!uploadMethod && (
            <View className="gap-4">
              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={handlePickPDF}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="doc.text.fill" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">Upload PDF File</Text>
                  <Text className="text-sm text-muted text-center">Choose a PDF contract from your device</Text>
                  <Text className="text-xs text-muted">Max 10MB</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={() => setUploadMethod("text")}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="doc.text.fill" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">Paste Contract Text</Text>
                  <Text className="text-sm text-muted text-center">Copy and paste the contract text directly</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* PDF Upload Flow */}
          {uploadMethod === "pdf" && pdfFile && (
            <View className="gap-4">
              <View className="bg-surface rounded-2xl p-5 border border-border">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                      {pdfFile.name}
                    </Text>
                    <Text className="text-sm text-muted mt-1">
                      {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ opacity: 1 }}
                    onPress={handleRemovePDF}
                  >
                    <IconSymbol size={24} name="xmark.circle.fill" color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>

              <View>
                <Text className="text-base font-semibold text-foreground mb-2">Contract Name</Text>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder="e.g., Service Agreement"
                  placeholderTextColor={colors.muted}
                  value={contractName}
                  onChangeText={setContractName}
                />
              </View>
            </View>
          )}

          {/* Text Upload Flow */}
          {uploadMethod === "text" && (
            <View className="gap-4">
              <View>
                <Text className="text-base font-semibold text-foreground mb-2">Contract Name</Text>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder="e.g., Service Agreement"
                  placeholderTextColor={colors.muted}
                  value={contractName}
                  onChangeText={setContractName}
                />
              </View>

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-foreground">Contract Text</Text>
                  <Text className="text-sm text-muted">{contractText.length} characters</Text>
                </View>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder="Paste your contract text here..."
                  placeholderTextColor={colors.muted}
                  value={contractText}
                  onChangeText={setContractText}
                  multiline
                  numberOfLines={10}
                  textAlignVertical="top"
                  style={{ minHeight: 200 }}
                />
              </View>

              <TouchableOpacity
                className="py-3"
                style={{ opacity: 1 }}
                onPress={() => {
                  setUploadMethod(null);
                  setContractText("");
                  setContractName("");
                }}
              >
                <Text className="text-center font-semibold" style={{ color: colors.primary }}>
                  Choose Different Method
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Disclaimer */}
          {uploadMethod && (
            <View className="bg-surface rounded-xl p-4 border border-border">
              <View className="flex-row items-start gap-3">
                <IconSymbol size={20} name="exclamationmark.triangle.fill" color={colors.warning} />
                <Text className="flex-1 text-xs text-muted leading-relaxed">
                  This analysis is for informational purposes only and does not constitute legal
                  advice. Please consult with a qualified attorney for legal guidance.
                </Text>
              </View>
            </View>
          )}

          {/* Analyze Button */}
          {uploadMethod && (
            <TouchableOpacity
              className="bg-primary px-6 py-4 rounded-2xl"
              style={{ opacity: 1 }}
              onPress={handleAnalyze}
              disabled={isAnalyzing}
            >
              <Text className="text-white font-bold text-lg text-center">
                {isAnalyzing ? "Analyzing..." : "Analyze Contract"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
