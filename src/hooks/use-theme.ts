/**
 * Hook that sets up Theme Manager for the application, returns the theme based on either user preference, or system
 */
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { Appearance, ColorSchemeName } from "react-native";
import { darkTheme, lightTheme, Theme } from "core/theme/theme.ts";
import { useEffect, useState } from "react";

export function useTheme(): Theme {
  const userReducer = useSelector(({ userReducer }: State) => userReducer);
  const [currentScheme, setCurrentScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );
  Appearance.addChangeListener((preferences) => {
    setCurrentScheme(preferences.colorScheme);
  });
  useEffect(() => {});

  if (userReducer?.user) {
    return userReducer.user.mobileDarkMode ? darkTheme : lightTheme;
  } else {
    return currentScheme === "dark" ? darkTheme : lightTheme;
  }
}
