import { useSetupProgress } from '@/providers/SetupProgressProvider';
export function useFirstLaunch() {
  const { isFirstLaunch, isOnboarding } = useSetupProgress();
  return { isFirstLaunch, isOnboarding };
}
