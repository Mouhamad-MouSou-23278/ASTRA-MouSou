import { useState } from "react";
import { api } from "../lib/api";
import { ErrorBanner, useAction } from "./ui";

interface Proposal {
  proposal_id: string;
  tool_name: string;
  entity_key: string;
  description: string;
  parameters: Record<string, any>;
  diff: Record<string, { before: any; after: any }>;
  requires_confirmation: boolean;
}

interface Citation {
  standard: string;
  title: string;
  section: string;
  url: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  citations?: Citation[];
}

export function PhysicalAgentChat({
  selectedSensorKey,
  onSensorCreated,
}: {
  selectedSensorKey?: string;
  onSensorCreated?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Welcome to the **ASTRA Physical Sensor Engineering AI Assistant**. I can evaluate your sensor parameters against **NASA-STD-3001**, synthesize new sensor drafts, configure physics equations, or explain Trusted Data Layer metrics.",
    },
  ]);
  const [input, setInput] = useState("");
  const act = useAction();
  const approveAct = useAction();

  const send = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    act.run(async () => {
      const resp = await api<any>("/physical-lab/agent/chat", {
        body: {
          message: text,
          context_sensor_key: selectedSensorKey || null,
        },
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: resp.reply,
        proposals: resp.proposals,
        citations: resp.citations,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    });
  };

  const approveProposal = (prop: Proposal) => {
    approveAct.run(async () => {
      await api("/physical-lab/agent/approve-proposal", {
        body: {
          proposal_id: prop.proposal_id,
          tool_name: prop.tool_name,
          entity_key: prop.entity_key,
          parameters: prop.parameters,
        },
      });
      // Replace with success message
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Proposal approved and executed! Sensor \`${prop.entity_key}\` is now saved as a draft in the ASTRA catalog.`,
        },
      ]);
      if (onSensorCreated) onSensorCreated();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "540px" }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 0 10px",
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn sm"
          onClick={() => send("Check compliance with NASA-STD-3001")}
        >
          📋 Check NASA-STD-3001
        </button>
        <button
          className="btn sm"
          onClick={() => send("Propose a new sensor draft for an optical pulse oximeter")}
        >
          🔬 Propose Pulse Oximeter
        </button>
        <button
          className="btn sm"
          onClick={() => send("Propose a spacesuit pressure gauge")}
        >
          🎛️ Propose Suit Pressure Gauge
        </button>
        <button
          className="btn sm"
          onClick={() => send("Explain available physics transducer models")}
        >
          ⚙️ Physics Models
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px",
          background: "#161920",
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "#2b3b55" : "#1e232e",
              border: m.role === "assistant" ? "1px solid #2e3848" : "none",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#e2e8f0",
              fontSize: "0.9rem",
              lineHeight: 1.45,
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "#7d8b99",
                marginBottom: 4,
                fontWeight: "bold",
              }}
            >
              {m.role === "user" ? "You" : "ASTRA Physical AI Agent"}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>

            {/* Citations Box */}
            {m.citations && m.citations.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  background: "#14171e",
                  borderLeft: "3px solid #38bdf8",
                  borderRadius: 4,
                  fontSize: "0.8rem",
                }}
              >
                <b style={{ color: "#38bdf8" }}>NASA Scientific Standards Cited:</b>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {m.citations.map((c, i) => (
                    <li key={i}>
                      <b>{c.standard}:</b> {c.title} ({c.section})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Proposal Diff Card */}
            {m.proposals && m.proposals.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {m.proposals.map((p) => (
                  <div
                    key={p.proposal_id}
                    style={{
                      background: "#131720",
                      border: "1px solid #4f46e5",
                      borderRadius: 6,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontWeight: "bold", color: "#a5b4fc" }}>
                      📝 Proposed Mutation: {p.description}
                    </div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      Tool: <code>{p.tool_name}</code> (Key: <code>{p.entity_key}</code>)
                    </div>
                    <div
                      style={{
                        margin: "8px 0",
                        padding: "6px 8px",
                        background: "#0c0e14",
                        borderRadius: 4,
                        fontSize: "0.78rem",
                        fontFamily: "monospace",
                      }}
                    >
                      {Object.entries(p.diff).map(([k, d]) => (
                        <div key={k}>
                          <span style={{ color: "#94a3b8" }}>{k}:</span>{" "}
                          <span style={{ color: "#f87171" }}>
                            {JSON.stringify(d.before)}
                          </span>{" "}
                          &rarr;{" "}
                          <span style={{ color: "#4ade80" }}>
                            {JSON.stringify(d.after)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: 8,
                      }}
                    >
                      <button
                        className="btn primary sm"
                        disabled={approveAct.busy}
                        onClick={() => approveProposal(p)}
                      >
                        {approveAct.busy ? "Approving..." : "Approve & Apply to Catalog"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ErrorBanner error={act.error || approveAct.error} />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          type="text"
          placeholder="Ask ASTRA Physical Agent (e.g. 'Propose a radiation dosimeter draft')..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          style={{ flex: 1 }}
        />
        <button
          className="btn primary"
          disabled={act.busy || !input.trim()}
          onClick={() => send()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
