import { useEffect, useRef, useState } from "react";
import { api, streamUrl, type Access } from "../lib/api";
import type { Frame, History, SessionDetail, SessionState, SimEvent, StreamMessage } from "../lib/types";

const SERIES_STRIDE = 2; // keep one chart sample per simulated second (frames arrive at 2 Hz)

/**
 * Client-side mirror of one live session. It is mutable on purpose: frames can
 * arrive 30 times a second, so React components poll `version` at their own
 * pace (see useStoreVersion) instead of re-rendering per frame. The 3D scene
 * reads `frame` directly inside its animation loop.
 *
 * The store only ever *receives* state. Nothing here can change the simulation.
 */
export class SessionStore {
  state: SessionState | null = null;
  t: number[] = [];
  series: Record<string, { v: (number | null)[]; q: number[] }> = {};
  truth: Record<string, number[]> = {};
  trail: [number, number][] = [];
  events: SimEvent[] = [];
  frame: Frame | null = null;
  frameAt = 0;
  notice: string | null = null;
  connected = false;
  version = 0;
  /** Incremented when the run restarts, so views can drop per-run state. */
  epoch = 0;

  private static readonly QUALITY: Record<string, number> = { good: 0, suspect: 1, bad: 2, missing: 3 };

  applyHistory(session: SessionState, history: History, events: SimEvent[], frame: Frame | null): void {
    this.state = session;
    this.t = history.t.slice();
    this.series = {};
    for (const [k, s] of Object.entries(history.sensors)) this.series[k] = { v: s.v.slice(), q: s.q.slice() };
    this.truth = {};
    for (const [k, v] of Object.entries(history.truth)) this.truth[k] = v.slice();
    this.trail = history.trail.slice();
    this.events = events.slice();
    this.frame = frame;
    this.frameAt = performance.now();
    this.epoch++;
    this.version++;
  }

  applyFrames(frames: Frame[]): void {
    for (const f of frames) {
      if (this.frame && f.seq <= this.frame.seq) continue; // duplicate after a resync
      this.frame = f;
      if (f.seq % SERIES_STRIDE === 0) {
        this.t.push(f.t);
        for (const [k, r] of Object.entries(f.sensors)) {
          const s = (this.series[k] ??= { v: [], q: [] });
          s.v.push(r[0]);
          s.q.push(SessionStore.QUALITY[r[1]] ?? 3);
        }
        for (const [k, v] of Object.entries(f.truth)) (this.truth[k] ??= []).push(v);
        if (f.astronaut.outside) this.trail.push([f.astronaut.x, f.astronaut.y]);
      }
      if (f.events.length) this.events.push(...f.events);
    }
    if (this.state && this.frame) this.state = { ...this.state, sim_time: this.frame.t };
    this.frameAt = performance.now();
    this.version++;
  }

  applyState(session: SessionState): void {
    this.state = session;
    this.version++;
  }

  setNotice(message: string | null): void {
    this.notice = message;
    this.version++;
  }

  setConnected(value: boolean): void {
    this.connected = value;
    this.version++;
  }
}

/** Re-render the calling component whenever the store changed, at most every `intervalMs`. */
export function useStoreVersion(store: SessionStore, intervalMs = 250): number {
  const [version, setVersion] = useState(store.version);
  useEffect(() => {
    setVersion(store.version);
    const id = window.setInterval(() => setVersion((v) => (v === store.version ? v : store.version)), intervalMs);
    return () => window.clearInterval(id);
  }, [store, intervalMs]);
  return version;
}

/** Load a session and keep a live, auto-reconnecting stream open for it. */
export function useSessionStream(sessionId: string | null, access?: Access) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const viewerToken = access?.viewerToken;
  // One store per (session, credential); a new one is created when either changes.
  const key = `${sessionId ?? ""}|${viewerToken ?? ""}`;
  const holder = useRef<{ key: string; store: SessionStore } | null>(null);
  if (holder.current?.key !== key) holder.current = { key, store: new SessionStore() };
  const store = holder.current.store;

  useEffect(() => {
    if (!sessionId) return;
    setDetail(null);
    setError(null);
    let closed = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    const acc: Access | undefined = viewerToken ? { viewerToken } : undefined;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(streamUrl(sessionId, acc));
      socket.onopen = () => { retry = 0; store.setConnected(true); };
      socket.onmessage = (ev) => {
        let msg: StreamMessage;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "hello" || msg.type === "reset") store.applyHistory(msg.session, msg.history, msg.events, msg.frame);
        else if (msg.type === "frames") store.applyFrames(msg.frames);
        else if (msg.type === "state") store.applyState(msg.session);
        else if (msg.type === "notice") store.setNotice(msg.message);
      };
      socket.onclose = (ev) => {
        store.setConnected(false);
        if (closed) return;
        if (ev.code === 4401 || ev.code === 4404) {
          setError(new Error("Access to this session has ended (link expired, revoked, or signed out)."));
          return;
        }
        retry = Math.min(retry + 1, 5);
        timer = window.setTimeout(connect, retry * 1000);
      };
    };

    api<SessionDetail>(`/sessions/${sessionId}`, { access: acc })
      .then((d) => {
        if (closed) return;
        store.state = d.session;
        setDetail(d);
        connect();
      })
      .catch((e) => !closed && setError(e));

    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [sessionId, viewerToken, store]);

  return { detail, error, store };
}
