import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export type WorkspaceType = 'expense' | 'nutrition';

interface WorkspaceContextProps {
  activeWorkspace: WorkspaceType;
  setActiveWorkspace: (workspace: WorkspaceType) => Promise<void>;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextProps>({
  activeWorkspace: 'expense',
  setActiveWorkspace: async () => {},
  isLoading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeWorkspace, setActiveWorkspaceState] = useState<WorkspaceType>('expense');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const stored = await AsyncStorage.getItem('@active_workspace');
        if (stored === 'expense' || stored === 'nutrition') {
          setActiveWorkspaceState(stored as WorkspaceType);
        }
      } catch (error) {
        console.error('Failed to load workspace', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadWorkspace();
  }, []);

  const setActiveWorkspace = async (workspace: WorkspaceType) => {
    try {
      setActiveWorkspaceState(workspace);
      await AsyncStorage.setItem('@active_workspace', workspace);
      
      if (workspace === 'expense') {
        router.replace('/(tabs)' as any);
      } else {
        router.replace('/(nutrition)' as any);
      }
    } catch (error) {
      console.error('Failed to save workspace', error);
    }
  };

  return (
    <WorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace, isLoading }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
