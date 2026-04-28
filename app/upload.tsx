import { ScrollView, Text, View, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { getLocales } from "expo-localization";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import { getOrCreateDeviceId } from "@/lib/device-id";
import { AiDisclosureModal } from "@/components/ai-disclosure-modal";
import { useAiConsent } from "@/hooks/use-ai-consent";
import {
  endIapConnection,
  finishIapTransaction,
  getIapProducts,
  getRestorePurchases,
  initIapConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  IAP_PRODUCT_ID,
  requestFiveCreditsPurchase,
} from "@/lib/iap";

export default function UploadScreen() {
  const colors = useColors();
  const { t } = useTranslation();
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

  // AI consent (one-time disclosure required by Apple Guideline 5.1.1(i))
  const { hasConsented, isLoaded: isConsentLoaded, grantConsent } = useAiConsent();
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  // Pending analysis callback — stored while the user reads the disclosure modal
  const pendingAnalysisRef = useRef<(() => void) | null>(null);

  // IAP state
  const [iapReady, setIapReady] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [iapProduct, setIapProduct] = useState<any>(null);

  // IAP: init connection once on mount, clean up on unmount
  useEffect(() => {
    if (Platform.OS === "web") return;

    let purchaseListener: any = null;
    let errorListener: any = null;

    const init = async () => {
      console.log("[IAP] upload.tsx init: starting IAP initialization");

      // Fallback: if IAP init doesn't complete within 5 seconds, unblock the button anyway
      const iapTimeout = setTimeout(() => {
        console.log("[IAP] upload.tsx init: timeout reached (5s), setting iapReady=true as fallback");
        setIapReady(true);
      }, 5000);

      try {
        console.log("[IAP] upload.tsx init: calling initIapConnection");
        await initIapConnection();
        console.log("[IAP] upload.tsx init: initIapConnection done, fetching products");
        const products = await getIapProducts();
        console.log("[IAP] upload.tsx init: products fetched, count:", products?.length ?? 0);
        if (products && products.length > 0) {
          setIapProduct(products[0]);
        }
        clearTimeout(iapTimeout);
        console.log("[IAP] upload.tsx init: setting iapReady=true");
        setIapReady(true);

        purchaseListener = purchaseUpdatedListener(async (purchase: any) => {
          const receipt = purchase.transactionReceipt || purchase.transactionReceiptData || "";
          if (!receipt) {
            setIsPurchasing(false);
            return;
          }
          try {
            const deviceId = await getOrCreateDeviceId();
            const response = await fetch(`${getApiBaseUrl()}/api/iap/validate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-device-id": deviceId,
              },
              body: JSON.stringify({ receipt, productId: IAP_PRODUCT_ID }),
            });
            const data = await response.json();
            if (data.success) {
              await finishIapTransaction(purchase);
              trpcUtils.contracts.usageStatus.invalidate();
              setIsPurchasing(false);
              Alert.alert(
                t("upload.purchase_success"),
                data.creditsAdded > 0
                  ? t("upload.purchase_success_added", { count: data.creditsAdded })
                  : t("upload.purchase_success_applied"),
              );
            } else {
              await finishIapTransaction(purchase);
              Alert.alert(t("upload.purchase_error"), data.error || t("upload.purchase_error"));
            }
          } catch (err: any) {
            Alert.alert(t("upload.purchase_error"), err.message || t("upload.purchase_error"));
          } finally {
            setIsPurchasing(false);
          }
        });

        errorListener = purchaseErrorListener((error: any) => {
          setIsPurchasing(false);
          if (error.message && !error.message.toLowerCase().includes("cancel")) {
            Alert.alert(t("upload.purchase_failed"), error.message);
          }
        });
      } catch (err) {
        // IAP unavailable: simulator, Expo Go, or native module not built
        console.log("[IAP] upload.tsx init: error during IAP initialization:", err);
        clearTimeout(iapTimeout);
        setIapReady(true);
      }
    };

    init();

    return () => {
      purchaseListener?.remove();
      errorListener?.remove();
      endIapConnection().catch(() => {});
    };
  }, []);

  const handleRestorePurchases = async () => {
    try {
      setIsRestoring(true);
      const purchases = await getRestorePurchases();
      if (!purchases || purchases.length === 0) {
        Alert.alert(t("upload.no_purchases_found"), t("upload.no_purchases_body"));
        return;
      }
      // Re-validate each restored purchase against the server
      const deviceId = await getOrCreateDeviceId();
      let creditsRestored = 0;
      for (const purchase of purchases) {
        const receipt = purchase.transactionReceipt || purchase.transactionReceiptData || "";
        if (!receipt) continue;
        try {
          const response = await fetch(`${getApiBaseUrl()}/api/iap/validate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-device-id": deviceId,
            },
            body: JSON.stringify({ receipt, productId: IAP_PRODUCT_ID }),
          });
          const data = await response.json();
          if (data.success && data.creditsAdded > 0) {
            creditsRestored += data.creditsAdded;
          }
        } catch {
          // continue with remaining purchases
        }
      }
      trpcUtils.contracts.usageStatus.invalidate();
      if (creditsRestored > 0) {
        Alert.alert(t("upload.purchases_restored"), t("upload.purchases_restored_credits", { count: creditsRestored }));
      } else {
        Alert.alert(t("upload.purchases_restored"), t("upload.purchases_restored_applied"));
      }
    } catch (err: any) {
      Alert.alert(t("upload.restore_failed"), err.message || t("upload.restore_failed_body"));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleBuyCredits = async () => {
    try {
      setIsPurchasing(true);
      const safetyTimeout = setTimeout(() => setIsPurchasing(false), 60000);
      await requestFiveCreditsPurchase().finally(() => clearTimeout(safetyTimeout));
    } catch (err: any) {
      setIsPurchasing(false);
      if (!err.message?.toLowerCase().includes("cancel")) {
        Alert.alert(t("upload.purchase_failed"), err.message || t("upload.purchase_failed_body"));
      }
    }
  };

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
        throw new Error(t("upload.error_analysis_cancelled"));
      }
      if (status.status === "failed") {
        activeJobIdRef.current = null;
        throw new Error(status.error || "Analysis job failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    activeJobIdRef.current = null;
    throw new Error(t("upload.error_analysis_timeout"));
  };

  const handlePickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("upload.error_photo_permission"), t("upload.error_photo_permission_body"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    setImageFiles(
      result.assets.map((asset) => ({
        uri: asset.uri,
        mimeType: asset.mimeType || "image/jpeg",
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        fileSize: asset.fileSize,
      })),
    );
    setUploadMethod("images");
    if (!contractName.trim()) setContractName("Photo Contract");
  };

  const handleCaptureImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("upload.error_camera_permission"), t("upload.error_camera_permission_body"));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: "images",
        allowsMultipleSelection: false,
        quality: 0.85,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setImageFiles((prev) => [
        ...prev,
        {
          uri: asset.uri,
          mimeType: asset.mimeType || "image/jpeg",
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          fileSize: asset.fileSize,
        },
      ]);
      setUploadMethod("images");
      if (!contractName.trim()) setContractName("Photo Contract");
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert(t("upload.error_camera"), t("upload.error_camera_body"));
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
        Alert.alert(t("upload.error_file_too_large"), t("upload.error_file_too_large_body"));
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
      Alert.alert(t("upload.error_pick_pdf"), t("upload.error_pick_pdf_body"));
    }
  };

  const handleRemovePDF = () => {
    setPdfFile(null);
    setContractName("");
    setUploadMethod(null);
  };

  // The actual analysis work — no consent check.
  const runAnalysis = async () => {
    setAnalysisStage("uploading");

    const deviceLanguage = getLocales()?.[0]?.languageCode ?? "en";

    try {
      if (uploadMethod === "text") {
        const job = await enqueueDocumentMutation.mutateAsync({
          name: contractName.trim(),
          inputType: "text",
          text: contractText.trim(),
          language: deviceLanguage,
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
          language: deviceLanguage,
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
          language: deviceLanguage,
        });
        const analysisId = await waitForJobCompletion(job.jobId);

        // Navigate to analysis screen
        router.replace(`/analysis/${analysisId}` as any);
      }
    } catch (error: any) {
      activeJobIdRef.current = null;
      console.error("Analysis error:", error);
      const knownMessages = [
        t("upload.error_analysis_cancelled"),
        t("upload.error_analysis_timeout"),
      ];
      const message =
        typeof error?.message === "string" && knownMessages.includes(error.message)
          ? error.message
          : t("upload.error_analysis_default");
      Alert.alert(t("upload.error_analysis_failed"), message);
      setAnalysisStage(null);
    }
  };

  // Validation + consent gate.
  const handleAnalyze = async () => {
    if (!contractName.trim()) {
      Alert.alert(t("upload.error_missing_name"), t("upload.error_missing_name_body"));
      return;
    }

    if (uploadMethod === "text" && contractText.trim().length < 10) {
      Alert.alert(t("upload.error_invalid_text"), t("upload.error_invalid_text_body"));
      return;
    }

    if (uploadMethod === "pdf" && !pdfFile) {
      Alert.alert(t("upload.error_missing_pdf"), t("upload.error_missing_pdf_body"));
      return;
    }
    if (uploadMethod === "images" && imageFiles.length === 0) {
      Alert.alert(t("upload.error_missing_photos"), t("upload.error_missing_photos_body"));
      return;
    }

    if (!hasConsented) {
      pendingAnalysisRef.current = runAnalysis;
      setShowDisclosureModal(true);
      return;
    }

    await runAnalysis();
  };

  const handleConsentAgree = useCallback(async () => {
    await grantConsent();
    setShowDisclosureModal(false);
    const resume = pendingAnalysisRef.current;
    pendingAnalysisRef.current = null;
    if (resume) {
      Promise.resolve(resume()).catch((err) => {
        console.error("[Consent] resume failed:", err);
      });
    }
  }, [grantConsent]);

  const handleConsentDecline = useCallback(() => {
    pendingAnalysisRef.current = null;
    setShowDisclosureModal(false);
  }, []);

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
        <Text className="text-2xl font-bold text-foreground mt-6">{t("upload.analyzing_title")}</Text>
        <Text className="text-base text-muted mt-3 text-center max-w-xs">
          {analysisStage === "uploading"
            ? t("upload.stage_uploading")
            : analysisStage === "processing"
              ? t("upload.stage_processing")
              : t("upload.stage_analyzing")}
        </Text>
        <View className="mt-8 bg-surface rounded-xl p-5 border border-border max-w-sm">
          <Text className="text-sm text-muted text-center leading-relaxed">
            {t("upload.ai_note")}
          </Text>
        </View>
        <TouchableOpacity
          className="mt-6 px-5 py-3 rounded-full border border-border"
          style={{ opacity: cancelJobMutation.isPending ? 0.6 : 1 }}
          disabled={cancelJobMutation.isPending}
          onPress={handleCancelAnalysis}
        >
          <Text className="text-foreground font-semibold">{t("upload.cancel")}</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-6">
      {/* AI data-sharing disclosure — shown once before the first analysis */}
      <AiDisclosureModal
        visible={showDisclosureModal}
        onAgree={handleConsentAgree}
        onDecline={handleConsentDecline}
      />

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
            <Text className="text-3xl font-bold text-foreground flex-1">{t("upload.title")}</Text>
            <TouchableOpacity
              style={{ opacity: 1 }}
              onPress={() => router.push("/history" as any)}
            >
              <Text className="text-base font-semibold" style={{ color: colors.primary }}>{t("upload.history")}</Text>
            </TouchableOpacity>
          </View>

          {/* No credits — purchase banner */}
          {usage && usage.remainingCredits === 0 && (
            <View
              className="rounded-2xl p-5 border-2"
              style={{ backgroundColor: colors.primary + "12", borderColor: colors.primary }}
            >
              <Text className="text-base font-bold text-foreground text-center mb-1">
                {t("upload.no_credits_title")}
              </Text>
              <Text className="text-sm text-muted text-center mb-4">
                {t("upload.no_credits_subtitle")}
              </Text>
              <TouchableOpacity
                className="bg-primary px-6 py-3 rounded-full"
                style={{ opacity: (isPurchasing || isRestoring || !iapReady) ? 0.6 : 1 }}
                disabled={isPurchasing || isRestoring || !iapReady}
                onPress={handleBuyCredits}
              >
                <Text className="text-white font-bold text-center">
                  {isPurchasing
                    ? t("upload.processing")
                    : !iapReady
                      ? t("upload.loading")
                      : iapProduct?.localizedPrice
                        ? t("upload.buy_credits_price", { price: iapProduct.localizedPrice })
                        : t("upload.buy_credits_default")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="mt-3 py-2"
                style={{ opacity: (isPurchasing || isRestoring || !iapReady) ? 0.5 : 1 }}
                disabled={isPurchasing || isRestoring || !iapReady}
                onPress={handleRestorePurchases}
              >
                <Text className="text-sm text-center" style={{ color: colors.primary }}>
                  {isRestoring ? t("upload.restoring") : t("upload.restore_purchases")}
                </Text>
              </TouchableOpacity>
            </View>
          )}

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
                  <Text className="text-lg font-semibold text-foreground">{t("upload.method_pdf_title")}</Text>
                  <Text className="text-sm text-muted text-center">{t("upload.method_pdf_subtitle")}</Text>
                  <Text className="text-xs text-muted">{t("upload.method_pdf_note")}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={() => setUploadMethod("text")}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="doc.text.fill" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">{t("upload.method_text_title")}</Text>
                  <Text className="text-sm text-muted text-center">{t("upload.method_text_subtitle")}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={handlePickImages}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="photo.on.rectangle.angled" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">{t("upload.method_photos_title")}</Text>
                  <Text className="text-sm text-muted text-center">{t("upload.method_photos_subtitle")}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-surface rounded-2xl p-6 border-2 border-border"
                style={{ opacity: 1 }}
                onPress={handleCaptureImage}
              >
                <View className="items-center gap-3">
                  <IconSymbol size={48} name="camera.fill" color={colors.primary} />
                  <Text className="text-lg font-semibold text-foreground">{t("upload.method_camera_title")}</Text>
                  <Text className="text-sm text-muted text-center">{t("upload.method_camera_subtitle")}</Text>
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
                <Text className="text-base font-semibold text-foreground mb-2">{t("upload.contract_name_label")}</Text>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder={t("upload.contract_name_placeholder")}
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
                  {t("upload.photos_selected", { count: imageFiles.length })}
                </Text>
                <Text className="text-sm text-muted mt-1">
                  {t("upload.photos_note")}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-surface rounded-xl p-3 border border-border" onPress={handlePickImages}>
                  <Text className="text-center font-semibold" style={{ color: colors.primary }}>{t("upload.reselect")}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-surface rounded-xl p-3 border border-border" onPress={handleCaptureImage}>
                  <Text className="text-center font-semibold" style={{ color: colors.primary }}>{t("upload.add_camera_page")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Text Upload Flow */}
          {uploadMethod === "text" && (
            <View className="gap-4">
              <View>
                <Text className="text-base font-semibold text-foreground mb-2">{t("upload.contract_name_label")}</Text>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder={t("upload.contract_name_placeholder")}
                  placeholderTextColor={colors.muted}
                  value={contractName}
                  onChangeText={setContractName}
                />
              </View>

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-base font-semibold text-foreground">{t("upload.contract_text_label")}</Text>
                  <Text className="text-sm text-muted">{t("upload.characters", { count: contractText.length })}</Text>
                </View>
                <TextInput
                  className="bg-surface rounded-xl px-4 py-3 border border-border text-foreground"
                  placeholder={t("upload.contract_text_placeholder")}
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
                  {t("upload.choose_different")}
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
                  {t("upload.disclaimer_body")}
                </Text>
              </View>
            </View>
          )}
          {uploadMethod && usage && (
            <View className="bg-surface rounded-xl p-4 border border-border">
              <Text className="text-sm text-muted">
                {t("upload.credits_remaining", { count: usage.remainingCredits })}
              </Text>
            </View>
          )}

          {/* Analyze Button */}
          {uploadMethod && (
            <TouchableOpacity
              className="bg-primary px-6 py-4 rounded-2xl"
              style={{
                opacity:
                  !!analysisStage || usage?.remainingCredits === 0 || !isConsentLoaded
                    ? 0.4
                    : 1,
              }}
              onPress={handleAnalyze}
              disabled={
                !!analysisStage || usage?.remainingCredits === 0 || !isConsentLoaded
              }
            >
              <Text className="text-white font-bold text-lg text-center">
                {analysisStage ? t("upload.analyzing_button") : t("upload.analyze_button")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
