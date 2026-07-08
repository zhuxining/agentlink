import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "zh",
  resources: {
    en: {
      translation: {
        appName: "AgentLink",
        documentation: "Documentation",
        madeBy: "Made by LuanRoger",
        titleHomePage: "Home",
        titleSecondPage: "Second Page",
      },
    },
    zh: {
      translation: {
        appName: "AgentLink",
        documentation: "文档",
        madeBy: "LuanRoger 制作",
        titleHomePage: "首页",
        titleSecondPage: "第二页",
      },
    },
  },
});
