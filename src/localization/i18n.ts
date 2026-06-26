import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "zh",
  resources: {
    en: {
      translation: {
        appName: "AgentLink",
        titleHomePage: "Home",
        titleSecondPage: "Second Page",
        documentation: "Documentation",
        madeBy: "Made by LuanRoger",
      },
    },
    zh: {
      translation: {
        appName: "AgentLink",
        titleHomePage: "首页",
        titleSecondPage: "第二页",
        documentation: "文档",
        madeBy: "LuanRoger 制作",
      },
    },
  },
});
