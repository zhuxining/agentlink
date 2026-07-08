import type { i18n } from "i18next";
import { LOCAL_STORAGE_KEYS } from "@/constants";

export function setAppLanguage(lang: string, i18nInst: i18n) {
  localStorage.setItem(LOCAL_STORAGE_KEYS.LANGUAGE, lang);
  i18nInst.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export function updateAppLanguage(i18nInst: i18n) {
  const localLang = localStorage.getItem(LOCAL_STORAGE_KEYS.LANGUAGE);
  if (!localLang) {
    return;
  }

  i18nInst.changeLanguage(localLang);
  document.documentElement.lang = localLang;
}
