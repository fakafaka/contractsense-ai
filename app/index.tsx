import { useEffect } from "react";
import { router } from "expo-router";
import { View } from "react-native";

export default function Index() {
  useEffect(() => {
    // Redirect to welcome screen on app launch after a brief delay
    const timeout = setTimeout(() => {
      router.replace("/welcome" as any);
    }, 100);
    
    return () => clearTimeout(timeout);
  }, []);

  return <View style={{ flex: 1 }} />;
}
