import React, {createContext, useContext, useReducer, useCallback, ReactNode, useEffect} from "react";
import {DEFAULT_USER_PREFERENCES, UserPreferences} from "src/lib/database/userPreferences";
import {appPersistence} from "src/lib/persistence/appPersistence";

function getInitialUserPreferencesState(): UserPreferences {
  return appPersistence.userPreferences.load();
}

export const INITIAL_USER_PREFERENCES_STATE: UserPreferences = DEFAULT_USER_PREFERENCES;

const TOGGLE_SHOW_OCCURRENCES = "user_preferences/TOGGLE_SHOW_OCCURRENCES";
const TOGGLE_SHOW_CONFLICTS = "user_preferences/TOGGLE_SHOW_CONFLICTS";
const TOGGLE_SHOW_MATCHING_NUMBERS = "user_preferences/TOGGLE_SHOW_MATCHING_NUMBERS";

type UserPreferencesAction =
  | {type: typeof TOGGLE_SHOW_OCCURRENCES}
  | {type: typeof TOGGLE_SHOW_CONFLICTS}
  | {type: typeof TOGGLE_SHOW_MATCHING_NUMBERS};

export function userPreferencesReducer(state: UserPreferences, action: UserPreferencesAction): UserPreferences {
  switch (action.type) {
    case TOGGLE_SHOW_OCCURRENCES:
      const newStateOccurrences = {
        ...state,
        showOccurrences: !state.showOccurrences,
      };
      return newStateOccurrences;
    case TOGGLE_SHOW_CONFLICTS:
      const newStateConflicts = {
        ...state,
        showConflicts: !state.showConflicts,
      };
      return newStateConflicts;
    case TOGGLE_SHOW_MATCHING_NUMBERS:
      const newStateMatchingNumbers = {
        ...state,
        showMatchingNumbers: !state.showMatchingNumbers,
      };
      return newStateMatchingNumbers;
    default:
      return state;
  }
}

interface UserPreferencesContextType {
  state: UserPreferences;
  toggleShowOccurrences: () => void;
  toggleShowConflicts: () => void;
  toggleShowMatchingNumbers: () => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined);

interface UserPreferencesProviderProps {
  children: ReactNode;
  initialState?: UserPreferences;
}

export function UserPreferencesProvider({children, initialState}: UserPreferencesProviderProps) {
  const [state, dispatch] = useReducer(
    userPreferencesReducer,
    initialState,
    (state) => state ?? getInitialUserPreferencesState(),
  );

  useEffect(() => {
    appPersistence.userPreferences.save(state);
  }, [state]);

  const toggleShowOccurrences = useCallback(() => {
    dispatch({type: TOGGLE_SHOW_OCCURRENCES});
  }, []);

  const toggleShowConflicts = useCallback(() => {
    dispatch({type: TOGGLE_SHOW_CONFLICTS});
  }, []);

  const toggleShowMatchingNumbers = useCallback(() => {
    dispatch({type: TOGGLE_SHOW_MATCHING_NUMBERS});
  }, []);

  const value = {
    state,
    toggleShowOccurrences,
    toggleShowConflicts,
    toggleShowMatchingNumbers,
  };

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (context === undefined) {
    throw new Error("useUserPreferences must be used within a UserPreferencesProvider");
  }
  return context;
}
