import { useEffect, useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { FIRST_LAUNCH_KEY } from "@/components/onboarding/OnboardingCarousel";

/**
 * Intelligent Launch Router
 * 
 * 1. Preloads auth and first-launch state without layout flashing or white screens.
 * 2. If authenticated → Dashboard (or active workspace).
 * 3. If first launch → Onboarding Carousel.
 * 4. Otherwise → Login.
 */
export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [hasLaunchedBefore, setHasLaunchedBefore] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(FIRST_LAUNCH_KEY)
      .then((val) => {
        if (isMounted) setHasLaunchedBefore(val === "true");
      })
      .catch(() => {
        if (isMounted) setHasLaunchedBefore(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  if (authLoading || workspaceLoading || hasLaunchedBefore === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0F2F4B",
        }}
      />
    );
  }

  if (user) {
    if (activeWorkspace === "nutrition") {
      return <Redirect href={"/(nutrition)" as any} />;
    }
    if (activeWorkspace === "ganesh") {
      return <Redirect href={"/(ganesh)" as any} />;
    }
    return <Redirect href={"/(app)" as any} />;
  }

  // If the user has never launched the app before, show the Onboarding Carousel
  if (!hasLaunchedBefore) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href={"/welcome" as any} />;
}
