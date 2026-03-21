"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Zap, ShieldCheck, Send, Loader2, ExternalLink, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const BuildingLego = () => (
  <div className="flex items-end gap-1 h-6 w-12 justify-center">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        initial={{ y: -20, opacity: 0 }}
        animate={{ 
          y: 0, 
          opacity: 1,
          transition: { 
            repeat: Infinity, 
            duration: 1.5, 
            delay: i * 0.3,
            repeatDelay: 0.5
          } 
        }}
        className={cn(
          "w-3 rounded-sm",
          i === 0 ? "h-3 bg-cyber-cyan" : i === 1 ? "h-5 bg-cyber-blue" : "h-4 bg-cyber-pink"
        )}
      />
    ))}
  </div>
);

export default function AgentLauncher() {
  const [userId, setUserId] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; agentUrl?: string; token?: string; error?: string }>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const apiHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const response = await fetch(`http://${apiHost}:3000/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, telegramToken }),
      });
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: "Failed to connect to Neural Master Server" });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenDashboard = async () => {
    if (!result?.agentUrl || !userId) return;
    
    // Abrir el dashboard en pestaña nueva
    window.open(result.agentUrl, "_blank");
    
    // Iniciar bucle de "Force Unlock" en el fondo desde el front
    setLoading(true);
    let success = false;
    for (let i = 0; i < 5; i++) {
        try {
            const apiHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
            const res = await fetch(`http://${apiHost}:3000/api/agents/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            const data = await res.json();
            if (data.success) {
                success = true;
                break;
            }
        } catch (e) { /* Sigue intentando */ }
        await new Promise(r => setTimeout(r, 2000)); // Esperar 2s entre reintentos
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-6 scanline">
      <div className="cyber-bg" />
      <div className="cyber-grid absolute inset-0 z-0 opacity-20" />

      <div className="w-full max-w-xl z-10">
        {/* Header Section */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center p-3 rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/20 mb-4"
          >
            <Bot className="w-10 h-10 text-cyber-cyan animate-pulse" />
          </motion.div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase neon-text mb-2">
            OpenClaw <span className="text-cyber-cyan">Neural</span>
          </h1>
          <p className="text-slate-400 font-medium">Next-Gen Autonomous Agent Orchestrator</p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-50" />
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-cyan ml-1">Agent Identifier</label>
              <div className="relative">
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. ALPHA_72"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all"
                />
                <Zap className="absolute right-4 top-4 w-5 h-5 text-slate-600" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-cyan ml-1">Telegram Neural Link (Optional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="Bot Token (BotFather)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all"
                />
                <Send className="absolute right-4 top-4 w-5 h-5 text-slate-600" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all relative overflow-hidden group min-h-[64px]",
                loading ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-cyber-cyan text-slate-950 hover:bg-white hover:neon-glow"
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-4">
                {loading ? (
                  <>
                    <BuildingLego />
                    Configuring Enterprise Core...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current" />
                    Deploy Neural Agent
                  </>
                )}
              </span>
            </button>
          </form>
        </div>

        {/* Results Section */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6"
            >
              {result.success ? (
                <div className="glass rounded-2xl p-6 border-green-500/20 bg-green-500/5">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-6 h-6 text-green-400" />
                    <h3 className="text-lg font-bold text-green-400">Core Online</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-sm group relative">
                      <p className="text-slate-500 mb-1 flex items-center gap-2 uppercase text-[10px] tracking-tighter">Access URL</p>
                      <button 
                        onClick={() => copyToClipboard(result.agentUrl || "")}
                        className="text-cyber-cyan hover:underline break-all pr-10 text-left"
                      >
                        {result.agentUrl}
                      </button>
                      <button 
                        onClick={() => copyToClipboard(result.agentUrl || "")}
                        className="absolute right-3 bottom-3 p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleOpenDashboard}
                        disabled={loading}
                        className="w-full bg-white/10 hover:bg-cyber-cyan text-white hover:text-slate-950 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border border-white/10 group overflow-hidden"
                      >
                         {loading ? "Unlocking Core..." : "Launch Dashboard"} <ExternalLink className="w-4 h-4" />
                      </button>
                      <p className="text-[10px] text-center text-slate-500 uppercase tracking-widest">Auto-Pairing enabled on launch</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass rounded-2xl p-6 border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    <p className="text-red-400 font-medium">{result.error}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <div className="mt-8 flex justify-center gap-6 opacity-30 group">
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse" />
            Neural Link Active
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-pink" />
            L3 Encryption
          </div>
        </div>
      </div>
    </main>
  );
}
