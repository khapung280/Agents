import { useEffect, useRef, useState } from "react";
import {
  isStopTranscript,
  isVoiceLanguage,
  localVoice,
  type VoiceLanguage,
} from "./voice-policy";
interface RecognitionEvent {
  results: {
    length: number;
    [key: number]: { isFinal: boolean; [key: number]: { transcript: string } };
  };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
interface RecognitionConstructor {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
}
declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}
export function useVoice(onText: (text: string) => void, onStop: () => void) {
  const [listening, setListening] = useState(false),
    [starting, setStarting] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [level, setLevel] = useState(0),
    [error, setError] = useState(""),
    [language, setLanguageState] = useState<VoiceLanguage>(() => {
      const stored = localStorage.getItem("agents-voice-language") || "";
      return isVoiceLanguage(stored) ? stored : "en-US";
    }),
    [allowRemote, setAllowRemoteState] = useState(false),
    [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const generation = useRef(0),
    playback = useRef(0),
    alive = useRef(true),
    busy = useRef(false),
    recognition = useRef<Recognition | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<AudioContext | null>(null),
    frame = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    callbacks = useRef({ onText, onStop });
  callbacks.current = { onText, onStop };
  const stop = () => {
    generation.current++;
    busy.current = false;
    clearTimeout(timer.current);
    const rec = recognition.current;
    recognition.current = null;
    if (rec) {
      rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* Some browsers reject abort before start. */
      }
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (audio.current && audio.current.state !== "closed")
      void audio.current.close().catch(() => {});
    audio.current = null;
    cancelAnimationFrame(frame.current);
    if (alive.current) {
      setListening(false);
      setStarting(false);
      setLevel(0);
    }
  };
  const interrupt = () => {
    playback.current++;
    window.speechSynthesis?.cancel();
    if (alive.current) {
      setSpeaking(false);
      setLevel(0);
    }
  };
  const listen = async () => {
    if (busy.current) {
      stop();
      return;
    }
    setError("");
    const Constructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Speech recognition is unavailable. Use the text command bar.");
      return;
    }
    interrupt();
    busy.current = true;
    setStarting(true);
    const current = ++generation.current;
    timer.current = setTimeout(() => {
      setError("Voice startup timed out. No recording remains active.");
      stop();
    }, 10000);
    try {
      const rec = new Constructor();
      recognition.current = rec;
      if (!allowRemote) {
        if (!("processLocally" in rec))
          throw new Error(
            "This browser cannot guarantee local speech recognition. Use text, or explicitly allow its speech service in Voice language and privacy.",
          );
        rec.processLocally = true;
        if (
          Constructor.available &&
          (await Constructor.available({
            langs: [language],
            processLocally: true,
          })) !== "available"
        )
          throw new Error(
            "No installed local recognition pack for this language. Use text or explicitly allow the browser speech service.",
          );
      } else if ("processLocally" in rec) rec.processLocally = false;
      if (current !== generation.current) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (current !== generation.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const context = new AudioContext();
      audio.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(acquired).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        if (current !== generation.current) return;
        analyser.getByteTimeDomainData(values);
        setLevel(
          Math.min(
            1,
            Math.sqrt(
              values.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) /
                values.length,
            ) * 8,
          ),
        );
        frame.current = requestAnimationFrame(sample);
      };
      rec.lang = language;
      rec.continuous = false;
      rec.interimResults = true;
      rec.onstart = () => {
        if (current !== generation.current) return;
        clearTimeout(timer.current);
        setStarting(false);
        setListening(true);
        sample();
        timer.current = setTimeout(() => {
          setError("Recording stopped at the 60-second limit.");
          stop();
        }, 60000);
      };
      rec.onresult = (event) => {
        if (current !== generation.current || !event.results.length) return;
        let text = "";
        for (let i = 0; i < event.results.length; i++)
          text += event.results[i][0].transcript;
        callbacks.current.onText(text.slice(0, 4000));
        if (
          event.results[event.results.length - 1].isFinal &&
          isStopTranscript(text)
        ) {
          stop();
          callbacks.current.onStop();
        }
      };
      rec.onerror = (event) => {
        if (current === generation.current) {
          setError("Microphone recognition: " + event.error);
          stop();
        }
      };
      rec.onend = () => {
        if (current === generation.current) stop();
      };
      rec.start();
    } catch (error) {
      if (current === generation.current) {
        setError(
          error instanceof Error ? error.message : "Microphone access failed.",
        );
        stop();
      }
    }
  };
  const speak = (text: string) => {
    setError("");
    const voice = localVoice(voices, language);
    if (!window.speechSynthesis || !voice) {
      setError(
        "No installed local output voice for this language. Text remains available.",
      );
      return;
    }
    stop();
    interrupt();
    const current = playback.current;
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onstart = () => {
      if (current === playback.current && alive.current) setSpeaking(true);
    };
    utterance.onboundary = () => {
      if (current !== playback.current || !alive.current) return;
      setLevel(0.6);
      setTimeout(() => {
        if (current === playback.current && alive.current) setLevel(0);
      }, 130);
    };
    const end = () => {
      if (current === playback.current && alive.current) {
        setSpeaking(false);
        setLevel(0);
      }
    };
    utterance.onend = end;
    utterance.onerror = end;
    speechSynthesis.speak(utterance);
  };
  useEffect(() => {
    alive.current = true;
    const refresh = () => setVoices(window.speechSynthesis?.getVoices() || []);
    refresh();
    window.speechSynthesis?.addEventListener("voiceschanged", refresh);
    return () => {
      alive.current = false;
      stop();
      interrupt();
      window.speechSynthesis?.removeEventListener("voiceschanged", refresh);
    };
  }, []);
  return {
    listening,
    starting,
    speaking,
    level,
    error,
    language,
    allowRemote,
    supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    localOutputAvailable: !!localVoice(voices, language),
    listen,
    stop,
    speak,
    interrupt,
    setLanguage: (value: string) => {
      if (isVoiceLanguage(value)) {
        stop();
        interrupt();
        setLanguageState(value);
        localStorage.setItem("agents-voice-language", value);
      }
    },
    setAllowRemote: (value: boolean) => {
      stop();
      setAllowRemoteState(value);
    },
  };
}
