"use client";

import { useState } from "react";

export default function AgentLauncherDebug() {
  const [userId, setUserId] = useState("");
  
  return (
    <main style={{ backgroundColor: '#020617', color: 'white', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>DEBUG MODE</h1>
        <p style={{ marginBottom: '1rem' }}>Si puedes ver esto, el servidor y React están funcionando bien.</p>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>ID DE AGENTE</label>
          <input 
            type="text" 
            value={userId} 
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Escribe algo aquí..."
            style={{ width: '100%', padding: '0.5rem', backgroundColor: 'black', border: '1px solid #333', color: 'white' }}
          />
        </div>
        
        <button style={{ width: '100%', padding: '0.75rem', backgroundColor: '#22d3ee', color: 'black', fontWeight: 'bold', border: 'none', borderRadius: '0.5rem' }}>
          PROBAR BOTÓN
        </button>
      </div>
    </main>
  );
}
