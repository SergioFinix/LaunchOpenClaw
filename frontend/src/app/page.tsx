"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Zap, ShieldCheck, Send, Loader2, ExternalLink, Copy, CheckCircle2, AlertCircle, Cpu, BrainCircuit } from "lucide-react";
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
  console.log("🛠️ OpenClaw Neural UI v2.0 - Enterprise Edition Loaded");
  const [companyId, setCompanyId] = useState("");
  const [businessPlan, setBusinessPlan] = useState("");
  const [mainAgentModel, setMainAgentModel] = useState("gpt-4o");
  const [telegramToken, setTelegramToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; url?: string; token?: string; error?: string }>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const apiHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiUrl = `http://${apiHost}:3000/api/companies`;
      console.log("🚀 Desplegando CLUSTER empresarial via:", apiUrl);

      const payload = {
        companyId: companyId.toLowerCase(),
        telegramToken: telegramToken,
        plandeempresa: businessPlan,
        mainAgent: { role: "ceo", model: mainAgentModel },
        departments: []
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      console.log("✅ Respuesta del Maestro:", data);
      setResult(data);
    } catch (err) {
      console.error("❌ Error de conexión con el Maestro:", err);
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

  const handleOpenDashboard = () => {
    if (!result?.url) return;
    window.open(result.url, "_blank");
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-6 scanline overflow-y-auto">
      <div className="cyber-bg" />
      <div className="cyber-grid absolute inset-0 z-0 opacity-20" />

      <div className="w-full max-w-2xl z-10 py-10">
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
            OpenClaw <span className="text-cyber-cyan">Enterprise</span>
          </h1>
          <p className="text-slate-400 font-medium">Neural Cluster Orchestration System</p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-50" />
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-cyber-orange ml-1">Company Identifier</label>
                <div className="relative">
                  <input
                    type="text"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    placeholder="e.g. cyber_dynamics"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all font-mono"
                  />
                  <ShieldCheck className="absolute right-4 top-4 w-5 h-5 text-slate-600" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-cyber-cyan ml-1">Main Core Model (CEO)</label>
                <div className="relative">
                  <select
                    value={mainAgentModel}
                    onChange={(e) => setMainAgentModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all appearance-none cursor-pointer"
                  >
                    <option value="gpt-4o" className="bg-slate-900">GPT-4o (Ultra)</option>
                    <option value="gpt-4o-mini" className="bg-slate-900">GPT-4o Mini (Fast)</option>
                    <option value="o1-preview" className="bg-slate-900">O1 Preview (Logic)</option>
                  </select>
                  <Cpu className="absolute right-4 top-4 w-5 h-5 text-slate-600 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-pink ml-1">Neural DNA (Business Plan & Mission)</label>
              <div className="relative">
                <textarea
                  value={businessPlan}
                  onChange={(e) => setBusinessPlan(e.target.value)}
                  placeholder="Describe the company's objective, rules and long-term mission..."
                  required
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-pink/50 focus:ring-1 focus:ring-cyber-pink/30 transition-all resize-none font-sans"
                />
                <BrainCircuit className="absolute right-4 top-4 w-5 h-5 text-slate-600 opacity-50" />
              </div>
              <p className="text-[10px] text-slate-500 uppercase tracking-tighter">This DNA will be injected into all cluster sub-agents.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-blue ml-1">Telegram Neural Link (Optional)</label>
              <div className="relative">
                <input
                  type="text"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="Bot Token (BotFather)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all font-mono"
                />
                <Send className="absolute right-4 top-4 w-5 h-5 text-slate-600" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all relative overflow-hidden group min-h-[64px]",
                loading ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-cyber-cyan text-slate-950 hover:bg-white hover:neon-cyan-glow"
              )}
            >
              <span className="relative z-10 flex items-center justify-center gap-4">
                {loading ? (
                  <>
                    <BuildingLego />
                    Provisioning Cluster Core...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-current" />
                    Launch Neural Cluster
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
                    <h3 className="text-lg font-bold text-green-400 tracking-tighter uppercase">Hierarchy Initialized</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-sm group relative">
                      <p className="text-slate-500 mb-1 flex items-center gap-2 uppercase text-[10px] tracking-tighter">Cluster Access URL</p>
                      <button 
                        onClick={() => copyToClipboard(result.url || "")}
                        className="text-cyber-cyan hover:underline break-all pr-10 text-left"
                      >
                        {result.url}
                      </button>
                      <button 
                        onClick={() => copyToClipboard(result.url || "")}
                        className="absolute right-3 bottom-3 p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleOpenDashboard}
                        className="w-full bg-white/10 hover:bg-cyber-cyan text-white hover:text-slate-950 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border border-white/10 group overflow-hidden"
                      >
                         Launch Dashboard <ExternalLink className="w-4 h-4" />
                      </button>
                      <p className="text-[10px] text-center text-slate-500 uppercase tracking-widest animate-pulse">Neural pairing active (15 min window)</p>
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
            Core: 18890-UP
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-[0.2em] text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-cyber-pink" />
            DNA-Mapping Enabled
          </div>
        </div>
      </div>
    </main>
  );
}
