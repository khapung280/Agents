import { useEffect, useRef, useState } from "react";
interface RecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [key: number]: { isFinal: boolean; [key: number]: { transcript: string } };
  };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
export function useVoice(onText: (text: string) => void, onStop: () => void) {
  const [listening, setListening] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [level, setLevel] = useState(0),
    [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<AudioContext | null>(null),
    frame = useRef(0);
  const supported = !!(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );
  const stop = () => {
    recognition.current?.abort();
    stream.current?.getTracks().forEach((t) => t.stop());
    void audio.current?.close();
    audio.current = null;
    cancelAnimationFrame(frame.current);
    setListening(false);
    setLevel(0);
  };
  const listen = async () => {
    if (listening) {
      stop();
      return;
    }
    setError("");
    const Constructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setError(
        "Speech recognition is unavailable in this browser. Use the text command bar.",
      );
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const context = new AudioContext();
      audio.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream.current).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
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
      sample();
      const rec = new Constructor();
      recognition.current = rec;
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++)
          text += e.results[i][0].transcript;
        onText(text);
        if (
          e.results[e.results.length - 1].isFinal &&
          /^stop[.!]?$/i.test(text.trim())
        )
          onStop();
      };
      rec.onerror = (e) => {
        setError(`Microphone recognition: ${e.error}`);
        stop();
      };
      rec.onend = stop;
      rec.start();
      setListening(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Microphone access was denied.",
      );
      stop();
    }
  };
  const speak = (text: string) => {
    if (!window.speechSynthesis) {
      setError("Speech playback is unavailable.");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.onstart = () => setSpeaking(true);
    utterance.onboundary = () => {
      setLevel(0.6);
      setTimeout(() => setLevel(0), 130);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setLevel(0);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setLevel(0);
    };
    speechSynthesis.speak(utterance);
  };
  const interrupt = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLevel(0);
  };
  useEffect(
    () => () => {
      recognition.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
      void audio.current?.close();
      cancelAnimationFrame(frame.current);
      window.speechSynthesis?.cancel();
    },
    [],
  );
  return {
    listening,
    speaking,
    level,
    error,
    supported,
    listen,
    stop,
    speak,
    interrupt,
  };
}
