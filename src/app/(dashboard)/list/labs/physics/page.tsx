"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { askWolframAgent, type WolframAgentResult } from "@/lib/math/wolframAgent";

interface ChatMsg {
  id: string;
  role: "user" | "bot";
  text: string;
  agentResult?: WolframAgentResult;
  loading?: boolean;
}

const topics = [
  { title: "Mechanics", icon: "⚙️", desc: "Forces, motion, Newton's laws, energy, momentum", examples: ["What is Newton's second law?", "Calculate force: mass=5kg acceleration=10m/s^2", "kinetic energy of 2kg at 3m/s"] },
  { title: "Waves & Optics", icon: "🌊", desc: "Sound waves, light, reflection, refraction", examples: ["speed of light in water", "wavelength of 440Hz sound", "Snell's law for glass"] },
  { title: "Thermodynamics", icon: "🔥", desc: "Heat, temperature, entropy, gas laws", examples: ["ideal gas law", "convert 100 celsius to fahrenheit", "specific heat of water"] },
  { title: "Electricity", icon: "⚡", desc: "Circuits, electric fields, Ohm's law", examples: ["Ohm's law V=IR", "resistance of 100 ohm in parallel with 200 ohm", "electric field of 1 coulomb at 1 meter"] },
  { title: "Nuclear Physics", icon: "☢️", desc: "Radioactivity, nuclear reactions, fission", examples: ["half-life of uranium-238", "E=mc^2 for 1kg", "binding energy of helium-4"] },
  { title: "Astrophysics", icon: "🌌", desc: "Stars, galaxies, cosmology, relativity", examples: ["mass of the sun", "distance to alpha centauri", "Schwarzschild radius of Earth"] },
];

const formulas = [
  { name: "Newton's Second Law", formula: "F = ma", category: "Mechanics" },
  { name: "Kinetic Energy", formula: "KE = ½mv²", category: "Mechanics" },
  { name: "Gravitational Force", formula: "F = Gm₁m₂/r²", category: "Mechanics" },
  { name: "Ohm's Law", formula: "V = IR", category: "Electricity" },
  { name: "Wave Speed", formula: "v = fλ", category: "Waves" },
  { name: "Mass-Energy", formula: "E = mc²", category: "Nuclear" },
  { name: "Coulomb's Law", formula: "F = kq₁q₂/r²", category: "Electricity" },
  { name: "Ideal Gas Law", formula: "PV = nRT", category: "Thermodynamics" },
];

const PhysicsPage = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "welcome", role: "bot", text: "Welcome to the Physics Lab! Ask me any physics question — I'm powered by Wolfram Alpha for accurate answers." },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleAsk = async (question: string) => {
    if (!question.trim()) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: question };
    const botId = `b-${Date.now()}`;
    setMessages((p) => [...p, userMsg, { id: botId, role: "bot", text: "", loading: true }]);

    try {
      const result = await askWolframAgent(question, undefined, "physics");

      if (result.error) {
        setMessages((p) => p.map((m) => m.id === botId ? { ...m, text: `Sorry, I couldn't answer that: ${result.error}`, loading: false } : m));
        return;
      }

      setMessages((p) => p.map((m) => m.id === botId ? {
        ...m,
        text: result.answer || result.text || "See the results below:",
        agentResult: result,
        loading: false,
      } : m));
    } catch {
      setMessages((p) => p.map((m) => m.id === botId ? { ...m, text: "Something went wrong. Please try again.", loading: false } : m));
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#F7F8FA]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/list/labs")} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition">← Labs</button>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2" fill="#fff" />
                <ellipse cx="10" cy="10" rx="8" ry="3.5" stroke="#fff" strokeWidth="1.2" fill="none" />
                <ellipse cx="10" cy="10" rx="8" ry="3.5" stroke="#fff" strokeWidth="1.2" fill="none" transform="rotate(60 10 10)" />
                <ellipse cx="10" cy="10" rx="8" ry="3.5" stroke="#fff" strokeWidth="1.2" fill="none" transform="rotate(-60 10 10)" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-800">Physics Lab</h1>
              <p className="text-[10px] text-gray-400">Powered by Wolfram Alpha AgentOne</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content: split between topics and chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: topics + formulas */}
        <div className="w-72 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0 hidden lg:block">
          <div className="p-4">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Topics</h2>
            <div className="space-y-2">
              {topics.map((t) => (
                <div key={t.title} className="group">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer transition">
                    <span className="text-lg">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700">{t.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">{t.desc}</div>
                    </div>
                  </div>
                  {/* Quick example buttons */}
                  <div className="pl-10 space-y-1 mt-1 hidden group-hover:block">
                    {t.examples.map((ex) => (
                      <button key={ex} onClick={() => handleAsk(ex)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline block truncate w-full text-left">
                        → {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <h2 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mt-6 mb-3">Key Formulas</h2>
            <div className="space-y-1.5">
              {formulas.map((f) => (
                <button key={f.name} onClick={() => handleAsk(f.formula)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                  <div className="text-xs font-medium text-gray-700">{f.name}</div>
                  <div className="text-sm font-mono text-blue-700 font-semibold">{f.formula}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-md"
                      : "bg-white border border-gray-200 text-gray-800 rounded-tl-md shadow-sm"
                  }`}>
                    {msg.loading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span className="animate-spin">⏳</span> Asking Wolfram Alpha...
                      </div>
                    ) : (
                      <>
                        <p className="text-sm whitespace-pre-wrap select-text">{msg.text}</p>

                        {/* Wolfram Agent pods */}
                        {msg.agentResult?.pods && msg.agentResult.pods.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {msg.agentResult.pods.slice(0, 8).map((pod, pi) => (
                              <div key={pi} className="bg-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                                <div className="px-3 py-1.5 bg-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                  {pod.title}
                                </div>
                                <div className="px-3 py-2">
                                  {pod.subpods.map((sp, si) => (
                                    <div key={si}>
                                      {sp.plaintext && <p className="text-sm font-mono text-gray-700 select-text whitespace-pre-wrap">{sp.plaintext}</p>}
                                      {sp.img && <img src={sp.img} alt={pod.title} className="mt-1 max-w-full rounded" />}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* LLM mode text */}
                        {msg.agentResult?.mode === "llm" && msg.agentResult.text && (
                          <pre className="mt-2 text-xs font-mono text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg overflow-x-auto select-text">
                            {msg.agentResult.text}
                          </pre>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.querySelector("input") as HTMLInputElement;
                if (input?.value.trim()) {
                  handleAsk(input.value.trim());
                  input.value = "";
                }
              }}
              className="max-w-3xl mx-auto flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Ask a physics question... (e.g., 'force of gravity on 5kg object')"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 transition"
              />
              <button type="submit" className="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition flex-shrink-0">
                Ask
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhysicsPage;
