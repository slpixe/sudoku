import i18n from "i18next";
import {initReactI18next} from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";

export enum Language {
  EN = "en",
  FR = "fr",
  ES = "es",
  DE = "de",
  IT = "it",
  PT = "pt",
  ZH = "zh",
}

const SUPPORTED_LANGUAGES = Object.values(Language);

// Detect browser language and return a supported language
const getBrowserLanguage = (): Language => {
  const browserLanguages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];

  for (const browserLanguage of browserLanguages) {
    const languageCode = browserLanguage.split("-")[0].toLowerCase();
    const supportedLanguage = SUPPORTED_LANGUAGES.find((language) => language === languageCode);
    if (supportedLanguage) {
      return supportedLanguage;
    }
  }

  return Language.EN;
};

i18n.use(initReactI18next).init({
  resources: {
    [Language.EN]: {translation: en},
    [Language.FR]: {translation: fr},
    [Language.ES]: {translation: es},
    [Language.DE]: {translation: de},
    [Language.IT]: {translation: it},
    [Language.PT]: {translation: pt},
    [Language.ZH]: {translation: zh},
  },
  lng: getBrowserLanguage(),
  fallbackLng: Language.EN,
  interpolation: {escapeValue: false},
});

export default i18n;
