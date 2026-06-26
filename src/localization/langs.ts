import type { Language } from "./language";

export default [
  {
    key: "zh",
    nativeName: "中文",
    prefix: "中",
  },
  {
    key: "en",
    nativeName: "English",
    prefix: "EN",
  },
] as const satisfies Language[];
