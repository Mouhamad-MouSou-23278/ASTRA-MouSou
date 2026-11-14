import { useCallback, useEffect, useRef, useState } from "react";
import { fmtClock } from "../components/ui";
import { api, authHeaders, errorText, type Access } from "../lib/api";
import type { SystemInfo } from "../lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  sim_time?: number;
  note?: string;
}

const SUGGESTIONS = [
  "Why is my body temperature increasing?",
  "What is the radiation level?",
  "Are there any warnings?",
  "Is the sensor data reliable?",
  "What should I do?",
];

type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void;
};

function browserRecognition(): Recognition | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? (new Ctor() as Recognition) : null;
}

/**
 * ASTRA AI chat with voice in and voice out.
 *
 * Speech is provider-agnostic: when the server has a speech provider it is used
 * (MediaRecorder upload / audio playback); otherwise the browser's Web Speech
 * API is the local fallback, and typed chat always works.
 */
export function ChatPanel({ sessionId, access, speech }: {
  sessionId: string; access?: Access; speech: SystemInfo["speech"] | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const serverSpeech = speech?.mode === "server";
  const canListen = serverSpeech
    ? typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined"
    : browserRecognition() !== null;
  const canSpeak = serverSpeech || "speechSynthesis" in window;

  useEffect(() => {
    api<Message[]>(`/sessions/${sessionId}/chat`, { access }).then(setMessages).catch(() => undefined);
    return () => { recRef.current?.stop(); window.speechSynthesis?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, access?.viewerToken]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const say = useCallback(async (reply: string) => {
    if (!speak) return;
    try {
      if (serverSpeech) {
        const res = await fetch("/api/voice/tts", {
          method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(access) },
          body: JSON.stringify({ text: reply.slice(0, 1200) }),
        });
        if (res.ok) {
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audio.onended = () => URL.revokeObjectURL(url);
          await audio.play();
          return;
        }
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(reply.replace(/\(Simulated data\.\)/i, ""));
        u.lang = "en-US";
        u.rate = 1.03;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* speech is best-effort; the text answer is already on screen */
    }
  }, [speak, serverSpeech, access]);

  const send = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await api<{ reply: string; provider: string; note: string; sim_time: number }>(
        `/sessions/${sessionId}/chat`, { body: { message: q }, access });
      setMessages((m) => [...m, { role: "assistant", content: res.reply, provider: res.provider, sim_time: res.sim_time, note: res.note }]);
      void say(res.reply);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [busy, sessionId, access, say]);

  const listen = async () => {
    if (listening) { recRef.current?.stop(); return; }
    setError(null);
    if (serverSpeech) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          const form = new FormData();
          form.append("file", new Blob(chunks, { type: recorder.mimeType }), "speech.webm");
          try {
            const res = await api<{ text: string }>("/voice/stt", { form, access });
            if (res.text) void send(res.text); else setError("No speech was recognised.");
          } catch (e) { setError(errorText(e)); }
        };
        recRef.current = { stop: () => recorder.state !== "inactive" && recorder.stop() };
        recorder.start();
        setListening(true);
        window.setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 12000);
      } catch {
        setError("Microphone access was denied.");
      }
      return;
    }
    const rec = browserRecognition();
    if (!rec) return;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const heard = e.results?.[0]?.[0]?.transcript; if (heard) void send(heard); };
    rec.onerror = (e) => setError(
      e.error === "not-allowed" ? "Microphone access was denied."
        : e.error === "network" ? "Browser speech recognition needs a network connection; type your question instead."
          : "Speech was not recognised; try again or type your question.");
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  return (
    <section className="panel chat-panel" style={{ flex: "1 1 54%" }}>
      <div className="panel-head">
        <h3>ASTRA AI</h3>
        <span className="muted small">explains live readings</span>
        {canSpeak && (
          <label className="check small right" title="Read ASTRA's answers aloud">
            <input type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} />
            speak answers
          </label>
        )}
      </div>
      <div className="chat">
        <div className="chat-log" ref={logRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="muted small">
              Ask ASTRA about what the sensors show. It answers only from this session's sensor output,
              warnings and scenario events, and never invents a reading.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
              {m.role === "assistant" && (
                <div className="meta">
                  {m.sim_time !== undefined ? fmtClock(m.sim_time) + " · " : ""}{m.provider ?? ""}
                  {m.note ? ` · ${m.note}` : ""}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="msg assistant muted">ASTRA is reading the telemetry…</div>}
          {error && <div className="banner error" style={{ margin: 0 }}>{error}</div>}
        </div>
        <div className="suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn sm" disabled={busy} onClick={() => send(s)}>{s}</button>
          ))}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <button type="button" className={`btn mic ${listening ? "live" : ""}`} onClick={listen} disabled={!canListen || busy}
            title={canListen ? (listening ? "Stop listening" : "Ask by voice") : "Voice input is not available in this browser; type instead"}
            aria-label="Voice input" aria-pressed={listening}>
            {listening ? "■" : "🎙"}
          </button>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
            placeholder={listening ? "Listening…" : "Ask ASTRA…"} aria-label="Question for ASTRA" />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
        </form>
      </div>
    </section>
  );
}
