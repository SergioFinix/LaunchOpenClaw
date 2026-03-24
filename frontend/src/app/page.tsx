"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Zap, ShieldCheck, Send, Loader2, ExternalLink, Copy, CheckCircle2, AlertCircle, Cpu, BrainCircuit, Plus, Trash2, Users } from "lucide-react";
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
  console.log("🛠️ OpenClaw Neural UI v2.1 - Multi-Agent Cluster Edition");
  const [companyId, setCompanyId] = useState("");
  const [businessPlan, setBusinessPlan] = useState("");
  const [mainAgentModel, setMainAgentModel] = useState("gpt-4o");
  const [telegramToken, setTelegramToken] = useState("");
  const [departments, setDepartments] = useState<{ name: string; model: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; url?: string; error?: string }>(null);
  const [copied, setCopied] = useState(false);

  const addDepartment = () => {
    setDepartments([...departments, { name: "", model: "gpt-4o-mini" }]);
  };

  const removeDepartment = (index: number) => {
    setDepartments(departments.filter((_, i) => i !== index));
  };

  const updateDepartment = (index: number, field: "name" | "model", value: string) => {
    const newDeps = [...departments];
    newDeps[index][field] = value;
    setDepartments(newDeps);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const apiHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiUrl = `http://${apiHost}:3000/api/companies`;
      
      const payload = {
        companyId: companyId.toLowerCase().replace(/\s+/g, '_'),
        telegramToken: telegramToken,
        plandeempresa: businessPlan,
        mainAgent: { role: "ceo", model: mainAgentModel },
        departments: departments.map(d => ({ 
          role: d.name.toLowerCase().replace(/\s+/g, '_'), 
          model: d.model 
        }))
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <main className="min-h-screen relative flex items-center justify-center p-6 scanline overflow-y-auto">
      <div className="cyber-bg" />
      <div className="cyber-grid absolute inset-0 z-0 opacity-20" />

      <div className="w-full max-w-3xl z-10 py-20">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="inline-flex items-center justify-center p-3 rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/20 mb-4">
            <Bot className="w-10 h-10 text-cyber-cyan animate-pulse" />
          </motion.div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase neon-text mb-2">
            OpenClaw <span className="text-cyber-cyan">Enterprise</span>
          </h1>
          <p className="text-slate-400 font-medium">Neural Cluster Orchestration System</p>
        </div>

        {/* Form */}
        <div className="glass rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-50" />
          
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Base Config */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-cyber-orange ml-1">Company Identifier</label>
                <input
                  type="text"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  placeholder="e.g. cyber_dynamics"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 transition-all font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-cyber-cyan ml-1">CEO Core Model</label>
                <select
                  value={mainAgentModel}
                  onChange={(e) => setMainAgentModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-cyber-cyan/50 appearance-none cursor-pointer"
                >
                  <option value="gpt-4o" className="bg-slate-900">GPT-4o (Reasoning)</option>
                  <option value="gpt-4o-mini" className="bg-slate-900">GPT-4o Mini (Efficiency)</option>
                  <option value="o1-preview" className="bg-slate-900">O1-Preview (Logical Depth)</option>
                </select>
              </div>
            </div>

            {/* Neural DNA */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-pink ml-1">Neural DNA (Main Mission)</label>
              <textarea
                value={businessPlan}
                onChange={(e) => setBusinessPlan(e.target.value)}
                placeholder="Declare the long-term mission and rules for the whole cluster..."
                required
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-pink/50 transition-all resize-none font-sans"
              />
            </div>

            {/* Departments Section */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyber-blue" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-white">Neural Departments</h3>
                </div>
                <button
                  type="button"
                  onClick={addDepartment}
                  className="px-3 py-1.5 bg-cyber-blue/20 hover:bg-cyber-blue/40 text-cyber-blue rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all border border-cyber-blue/30"
                >
                  <Plus className="w-3 h-3" /> Add Agent
                </button>
              </div>

              <div className="space-y-3">
                <AnimatePresence>
                  {departments.map((dep, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-white/5 p-3 rounded-xl border border-white/5"
                    >
                      <div className="md:col-span-6">
                        <input
                          type="text"
                          value={dep.name}
                          onChange={(e) => updateDepartment(index, "name", e.target.value)}
                          placeholder="Role (e.g. Marketing, Sales)"
                          required
                          className="w-full bg-transparent p-2 text-sm text-white focus:outline-none placeholder:text-slate-600 font-medium"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <select
                          value={dep.model}
                          onChange={(e) => updateDepartment(index, "model", e.target.value)}
                          className="w-full bg-transparent p-2 text-xs text-slate-400 focus:outline-none cursor-pointer"
                        >
                          <option value="gpt-4o-mini" className="bg-slate-900">GPT-4o Mini</option>
                          <option value="gpt-4o" className="bg-slate-900">GPT-4o</option>
                        </select>
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeDepartment(index)}
                          className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {departments.length === 0 && (
                  <p className="text-center text-[10px] text-slate-600 uppercase tracking-widest py-4 bg-white/5 rounded-2xl border border-dashed border-white/10">No sub-agents configured. CEO will operate solo.</p>
                )}
              </div>
            </div>

            {/* Telegram */}
            <div className="space-y-2 pt-4">
              <label className="text-xs font-bold uppercase tracking-widest text-cyber-cyan ml-1">Telegram Neural Link (Optional)</label>
              <input
                type="text"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="Bot Token (BotFather)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyber-cyan/50 font-mono"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-5 rounded-xl font-bold uppercase tracking-widest transition-all relative overflow-hidden flex items-center justify-center gap-4",
                loading ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-cyber-cyan text-slate-950 hover:bg-white hover:neon-cyan-glow"
              )}
            >
              {loading ? (
                <>
                  <BuildingLego />
                  Initializing Cluster...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 fill-current" />
                  Launch Neural Cluster
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
              {result.success ? (
                <div className="glass rounded-2xl p-6 border-green-500/20 bg-green-500/5">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-6 h-6 text-green-400" />
                    <h3 className="text-lg font-bold text-green-400 uppercase tracking-tighter">Cluster Online</h3>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-sm group relative">
                      <p className="text-slate-500 mb-1 uppercase text-[10px] tracking-tighter">Master Access URL</p>
                      <button onClick={() => copyToClipboard(result.url || "")} className="text-cyber-cyan hover:underline break-all pr-12 text-left">{result.url}</button>
                      <button onClick={() => copyToClipboard(result.url || "")} className="absolute right-3 bottom-3 p-2 hover:bg-white/10 rounded-lg text-slate-500 transition-colors">
                        {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <button onClick={() => window.open(result.url, "_blank")} className="w-full bg-white/10 hover:bg-cyber-cyan text-white hover:text-slate-950 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">Launch Dashboard <ExternalLink className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="glass rounded-2xl p-6 border-red-500/20 bg-red-500/5 flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                  <p className="text-red-400 font-medium">{result.error}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
