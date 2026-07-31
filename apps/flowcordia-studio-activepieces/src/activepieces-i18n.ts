import i18n from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";

void i18n.use(ICU).use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  initImmediate: false,
});

export default i18n;
