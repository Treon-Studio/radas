// Minimal i18n stub for the office scene — returns the last key segment as
// the display text so the scene renders standalone without react-i18next
// and locale bundles.

export function useTranslation() {
  const t = (key: string, vars?: Record<string, string | number>) => {
    let text = key.split(".").pop() ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{{${k}}}`, String(v));
      }
    }
    return text;
  };
  return { t, i18n: { language: "en" } };
}
