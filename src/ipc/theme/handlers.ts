import { os } from "@orpc/server";
import { nativeTheme } from "electron";
import { setThemeModeInputSchema } from "./schemas";

export const getCurrentThemeMode = os.handler(() => nativeTheme.themeSource);

export const toggleThemeMode = os.handler(() => {
  if (nativeTheme.shouldUseDarkColors) {
    nativeTheme.themeSource = "light";
  } else {
    nativeTheme.themeSource = "dark";
  }

  return nativeTheme.shouldUseDarkColors;
});

export const setThemeMode = os
  .input(setThemeModeInputSchema)
  .handler(({ input: mode }) => {
    if (mode === "light") {
      nativeTheme.themeSource = "light";
    } else if (mode === "dark") {
      nativeTheme.themeSource = "dark";
    } else {
      nativeTheme.themeSource = "system";
    }

    return nativeTheme.themeSource;
  });
