import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const AI_CONSENT_KEY = "ai_data_consent_v1";

type ConsentState = {
  /** true once the user has tapped "I Agree" */
  hasConsented: boolean;
  /** whether we've finished reading from AsyncStorage (avoid flicker) */
  isLoaded: boolean;
  /** call when the user taps "I Agree" */
  grantConsent: () => Promise<void>;
};

/**
 * Tracks whether the user has agreed to the AI data disclosure.
 *
 * Persisted in AsyncStorage under `ai_data_consent_v1` so it only shows once.
 * Bump the key suffix (e.g. _v2) if the disclosure text changes materially
 * and Apple requires re-acceptance.
 */
export function useAiConsent(): ConsentState {
  const [hasConsented, setHasConsented] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(AI_CONSENT_KEY)
      .then((value) => {
        setHasConsented(value === "true");
      })
      .catch(() => {
        // If storage read fails, default to not consented — safe fallback
        setHasConsented(false);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  const grantConsent = useCallback(async () => {
    try {
      await AsyncStorage.setItem(AI_CONSENT_KEY, "true");
    } catch {
      // Non-fatal: consent won't persist, but we still let the user proceed
      // within this session so we don't permanently block them on storage errors
    }
    setHasConsented(true);
  }, []);

  return { hasConsented, isLoaded, grantConsent };
}
