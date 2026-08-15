import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { logError } from "@/lib/errors";
import {
  resolveWorkspaceRoute,
  type WorkspaceType,
} from "@/shared/config/workspaceRoutes";

export type { WorkspaceType };

interface WorkspaceContextProps {
  activeWorkspace: WorkspaceType;
  setActiveWorkspace: (workspace: WorkspaceType) => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextProps>({
  activeWorkspace: "expense",
  setActiveWorkspace: async () => {},
  isLoading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeWorkspace, setActiveWorkspaceState] =
    useState<WorkspaceType>("expense");
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const stored = await AsyncStorage.getItem("@active_workspace");
        if (stored === "expense" || stored === "nutrition") {
          setActiveWorkspaceState(stored);
        }
      } catch (error) {
        logError("workspaceProvider.loadWorkspace", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadWorkspace();
  }, []);

  const setActiveWorkspace = async (workspace: WorkspaceType) => {
    try {
      setActiveWorkspaceState(workspace);
      await AsyncStorage.setItem("@active_workspace", workspace);
      router.replace(resolveWorkspaceRoute(workspace) as never);
    } catch (error) {
      logError("workspaceProvider.saveWorkspace", error);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{ activeWorkspace, setActiveWorkspace, isLoading }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
