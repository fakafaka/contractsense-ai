import { ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking } from "react-native";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  endIapConnection,
  finishIapTransaction,
  getIapProducts,
  initIapConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  getRestorePurchases,
  IAP_PRODUCT_ID,
  requestFiveCreditsPurchase,
} from "@/lib/iap";

export default function UploadScreen() {
  const colors = useColors();
  const [uploadMethod, setUploadMethod] = useState<"pdf" | "text" | "images" | null>(null);
  const [pdfFile, setPdfFile] = useState<{ name: string; uri: string; size: number } | null>(null);
  const [imageFiles, setImageFiles] = useState<{ uri: string; mimeType?: string; fileName?: string; fileSize?: number }[]>([]);
  const [contractText, setContractText] = useState("");
  const [contractName, setContractName] = useState("");
  const [analysisStage, setAnalysisStage] = useState<"uploading" | "processing" | "analyzing" | null>(null);

  const enqueueDocumentMutation = trpc.contracts.enqueueDocumentAsync.useMutation();
  const cancelJobMutation = trpc.contracts.cancelJob.useMutation();
  const trpcUtils = trpc.useUtils();
  const activeJobIdRef = useRef<string | null>(null);
  const { data: usage } = trpc.contracts.usageStatus.useQuery();

  const waitForJobCompletion = async (jobId: string) => {
    activeJobIdRef.current = jobId;
    const maxAttempts = 180; // ~6 minutes @ 2s
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await trpcUtils.contracts.getJobStatus.fetch({ jobId });
      if (status.status === "pending") setAnalysisStage("processing");
      if (status.status === "processing") setAnalysisStage("analyzing");
      if (status.status === "completed" && status.analysisId) {
        activeJobIdRef.current = null;
        return status.analysisId;
      }
      if (status.status === "cancelled") {
        activeJobIdRef.current = null;
        throw new Error("Analysis was cancelled");
      }
      if (status.status === "failed") {
        activeJobIdRef.current = null;
        throw new Error(status.error || "Analysis job failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    activeJobIdRef.current = null;
    throw new Error("Analysis timed out. Please try again.");
  };

  const handlePickImages = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    setImageFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.name,
        fileSize: asset.size,
      })),
    );
    setUploadMethod("images");
    if (!contractName.trim()) setContractName("Photo Contract");
  };

  const handleCaptureImage = async () => {
    try {
      await Linking.openURL("camera://");
      Alert.alert("Capture Photo", "Take document photos in your camera app, then tap 'Select Document Photos' to import them.");
    } catch {
      Alert.alert("Camera", "Please use your camera app to capture photos, then select them from the gallery.");
    }
  };

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
    if (uploadMethod === "images" && imageFiles.length === 0) {
      Alert.alert("Missing Photos", "Please select or capture at least one photo");
      return;
    }

    setAnalysisStage("uploading");

    try {
      if (uploadMethod === "text") {
        const job = await enqueueDocumentMutation.mutateAsync({
          name: contractName.trim(),
          inputType: "text",
          text: contractText.trim(),
        });
        const analysisId = await waitForJobCompletion(job.jobId);
        
        // Navigate to analysis screen
        router.replace(`/analysis/${analysisId}` as any);
      } else if (uploadMethod === "pdf" && pdfFile) {
        // Read PDF file as base64
        const pdfBase64 = await FileSystem.readAsStringAsync(pdfFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const job = await enqueueDocumentMutation.mutateAsync({
          name: contractName.trim(),
          inputType: "pdf",
          pdfBase64,
          pdfFileSize: pdfFile.size,
        });
        const analysisId = await waitForJobCompletion(job.jobId);
        
        // Navigate to analysis screen
        router.replace(`/analysis/${analysisId}` as any);
      } else if (uploadMethod === "images") {
        const images = [];
        for (const image of imageFiles) {
          const base64 = await FileSystem.readAsStringAsync(image.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          images.push({
            base64,
            mimeType: image.mimeType || "image/jpeg",
            size: image.fileSize || 0,
          });
        }
        const job = await enqueueDocumentMutation.mutateAsync({
          name: contractName.trim(),
          inputType: "images",
          images,
        });
        const analysisId = await waitForJobCompletion(job.jobId);

        // Navigate to analysis screen
        router.replace(`/analysis/${analysisId}` as any);
      }
    } catch (error: any) {
      activeJobIdRef.current = null;
      console.error("Analysis error:", error);
      Alert.alert("Analysis Failed", error.message || "Failed to analyze contract. Please try again.");
      setAnalysisStage(null);
    }
  };



  const handleCancelAnalysis = async () => {
    const jobId = activeJobIdRef.current;
    try {
      if (jobId) {
        await cancelJobMutation.mutateAsync({ jobId });
      }
    } catch (error) {
      console.warn("Cancel job failed:", error);
    } finally {
      activeJobIdRef.current = null;
      setAnalysisStage(null);
    }
  };

  // Processing Screen
  if (analysisStage) {
    return (
      <ScreenContainer className="p-6 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-2xl font-bold text-foreground mt-6">Analyzing Contract...</Text>
        <Text className="text-base text-muted mt-3 text-center max-w-xs">
          {analysisStage === "uploading"
            ? "Uploading..."
            : analysisStage === "processing"
              ? "Processing..."
              : "Analyzing..."}
        </Text>
        <View className="mt-8 bg-surface rounded-xl p-5 border border-border max-w-sm">
          <Text className="text-sm text-muted text-center leading-relaxed">
            Our AI is reading only the first 10 pages and identifying key terms, obligations, risks, and red flags.
          </Text>
        </View>
        <TouchableOpacity
          className="mt-6 px-5 py-3 rounded-full border border-border"
          style={{ opacity: cancelJobMutation.isPending ? 0.6 : 1 }}
          disabled={cancelJobMutation.isPending}
          onPress={handleCancelAnalysis}
        >
          <Text className="text-foreground font-semibold">Cancel</Text>
        </TouchableOpacity>
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
                  <Text className="text-xs text-muted">Max 10MB • first 10 pages analyzed</Text>
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
                  <Text className="text-sm text-muted text-center">Copy and paste the contract text directly (first section only is analyzed)</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={handlePickImages}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="photo.on.rectangle.angled" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">Select Document Photos</Text>
                  <Text className="text-sm text-muted text-center">Choose multiple photos from gallery (one document)</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={handleCaptureImage}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="camera.fill" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">Capture with Camera</Text>
                  <Text className="text-sm text-muted text-center">Take one or more photos (one document)</Text>
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
          {uploadMethod === "images" && (
            <View className="gap-4">
              <View className="bg-surface rounded-2xl p-5 border border-border">
                <Text className="text-base font-semibold text-foreground">
                  {imageFiles.length} photo(s) selected
                </Text>
                <Text className="text-sm text-muted mt-1">
                  Photos are merged in order into one document for analysis.
                </Text>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-surface rounded-xl p-3 border border-border" onPress={handlePickImages}>
                  <Text className="text-center font-semibold" style={{ color: colors.primary }}>Reselect</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-surface rounded-xl p-3 border border-border" onPress={handleCaptureImage}>
                  <Text className="text-center font-semibold" style={{ color: colors.primary }}>Add Camera Page</Text>
                </TouchableOpacity>
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
                  advice. Only the first 10 pages (or equivalent first text section) are analyzed.
                  New users get 3 free analyses.
                </Text>
              </View>
            </View>
          )}
          {uploadMethod && usage && (
            <View className="bg-surface rounded-xl p-4 border border-border">
              <Text className="text-sm text-muted">
                Remaining credits: <Text className="text-foreground font-semibold">{usage.remainingCredits}</Text>.{" "}
                New users get 3 free analyses. Additional +5 credit packs will be available in V1.
              </Text>
            </View>
          )}

          {/* Analyze Button */}
          {uploadMethod && (
            <TouchableOpacity
              className="bg-primary px-6 py-4 rounded-2xl"
              style={{ opacity: 1 }}
              onPress={handleAnalyze}
              disabled={!!analysisStage}
            >
              <Text className="text-white font-bold text-lg text-center">
                {analysisStage ? "Analyzing..." : "Analyze Contract"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
