import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

export type PropertyEditorMode = 'panel' | 'radial';

interface UiPreferences {
  propertyEditorMode: PropertyEditorMode;
  setPropertyEditorMode: (mode: PropertyEditorMode) => void;
}

const STORAGE_KEY = 'scrawl.property-editor-mode';
const UiPreferencesContext = createContext<UiPreferences | null>(null);

function readPropertyEditorMode(): PropertyEditorMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'radial' ? 'radial' : 'panel';
  } catch {
    return 'panel';
  }
}

export function UiPreferencesProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [propertyEditorMode, setPropertyEditorMode] =
    useState<PropertyEditorMode>(readPropertyEditorMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, propertyEditorMode);
    } catch {
      // The selected mode still applies for this session when storage is unavailable.
    }
  }, [propertyEditorMode]);

  const value = useMemo(
    () => ({ propertyEditorMode, setPropertyEditorMode }),
    [propertyEditorMode],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferences {
  const preferences = useContext(UiPreferencesContext);
  if (!preferences) {
    throw new Error('useUiPreferences must be used inside UiPreferencesProvider');
  }
  return preferences;
}
