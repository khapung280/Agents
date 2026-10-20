export const voiceLanguages = {
  "en-US": "English",
  "ne-NP": "नेपाली / Nepali",
} as const;
export type VoiceLanguage = keyof typeof voiceLanguages;
export const isVoiceLanguage = (value: string): value is VoiceLanguage =>
  Object.hasOwn(voiceLanguages, value);
export const isStopTranscript = (text: string) =>
  /^(?:stop|रोक|रोक्नुहोस्)[.!।]?$/iu.test(text.normalize("NFC").trim());
export function localVoice<T extends { lang: string; localService: boolean }>(
  voices: T[],
  language: VoiceLanguage,
): T | undefined {
  const normalize = (value: string) => value.toLowerCase().replaceAll("_", "-");
  const local = voices.filter((voice) => voice.localService);
  return (
    local.find((voice) => normalize(voice.lang) === normalize(language)) ??
    local.find(
      (voice) => normalize(voice.lang).split("-")[0] === language.split("-")[0],
    )
  );
}
