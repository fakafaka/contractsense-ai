import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "@/locales/en.json";
import ru from "@/locales/ru.json";
import zh from "@/locales/zh.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import de from "@/locales/de.json";
import ja from "@/locales/ja.json";
import pt from "@/locales/pt.json";
import ko from "@/locales/ko.json";
import ar from "@/locales/ar.json";
import it from "@/locales/it.json";
import tr from "@/locales/tr.json";

const SUPPORTED = new Set(["en", "ru", "zh", "es", "fr", "de", "ja", "pt", "ko", "ar", "it", "tr"]);

const deviceLang = getLocales()?.[0]?.languageCode ?? "en";
const lng = SUPPORTED.has(deviceLang) ? deviceLang : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    zh: { translation: zh },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    ja: { translation: ja },
    pt: { translation: pt },
    ko: { translation: ko },
    ar: { translation: ar },
    it: { translation: it },
    tr: { translation: tr },
  },
  lng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
