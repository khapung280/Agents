import { voiceLanguages } from "../voice-policy";
import type { useVoice } from "../voice";
export function VoiceControls({
  voice,
}: {
  voice: ReturnType<typeof useVoice>;
}) {
  return (
    <details className="voice-controls">
      <summary>Voice language and privacy</summary>
      <label>
        Language{" "}
        <select
          aria-label="Voice language"
          value={voice.language}
          onChange={(e) => voice.setLanguage(e.target.value)}
        >
          {Object.entries(voiceLanguages).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={voice.allowRemote}
          onChange={(e) => voice.setAllowRemote(e.target.checked)}
        />{" "}
        Allow browser speech service for recognition (may send microphone audio
        externally)
      </label>
      <p>
        {voice.allowRemote
          ? "Browser speech service explicitly enabled for this session."
          : "Local recognition only; requires an installed browser language pack."}{" "}
        No packs are downloaded automatically. Review transcripts before
        submitting; voice cannot approve tasks.
      </p>
      <p>
        {voice.localOutputAvailable
          ? "Installed local output voice available."
          : "No installed local output voice for this language."}{" "}
        Live AI voice reasoning is not verified.
      </p>
      <button
        className="secondary"
        onClick={() =>
          voice.speak(
            voice.language === "ne-NP"
              ? "स्थानीय आवाज परीक्षण।"
              : "Local voice output test.",
          )
        }
      >
        Test local voice
      </button>
      {voice.starting && (
        <p role="status">Starting microphone… Use Stop listening to cancel.</p>
      )}
    </details>
  );
}
