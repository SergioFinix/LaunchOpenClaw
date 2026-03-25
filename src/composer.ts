import { AgentConfig } from './server';
import * as fs from 'fs/promises'; 
import * as path from 'path'; // Added path import

export const generateCompanyCompose = async (companyId: string, companyBaseDir: string, agents: any[]): Promise<string> => { 
    // Tomamos la configuración del CEO (siempre el primero) para los puertos y tokens globales
    const ceo = agents.find(a => a.role === 'ceo') || agents[0];
    
    // Asignamos recursos robustos para una instancia que manejará múltiples sub-agentes
    const memLimit = '4096m'; // 4GB de RAM (Hardening contra picos de sub-agentes)
    const cpuLimit = '1.5';

    // Proxy code to silence startup errors
    const proxyCode = `const net = require('net');
const server = net.createServer((clientSocket) => {
    const targetSocket = net.connect(18789, '127.0.0.1', () => {
        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
    });
    targetSocket.on('error', (err) => {
        // Silencio durante el arranque...
        clientSocket.destroy();
    });
    clientSocket.on('error', (err) => {
        targetSocket.destroy();
    });
});
server.listen(18889, '0.0.0.0', () => {
    console.log('[Master Proxy] Puente 18889 -> 18789 Interno Activo');
});`;
    const proxyPath = path.join(companyBaseDir, 'proxy.js'); 
    await fs.writeFile(proxyPath, proxyCode);

    return `services:
  main:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: oc-${companyId}
    user: "0:0"
    shm_size: '512mb'
    init: true
    ports:
      - "\${OPENCLAW_GATEWAY_PORT_HOST:-${ceo.port}}:18889"
    command: ["/bin/sh", "-c", "node /root/.openclaw/proxy.js & exec /usr/local/bin/docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured"]
    environment:
      - "NODE_OPTIONS=--max-old-space-size=2048"
      - "OPENCLAW_MODE=local"
      - "OPENCLAW_GATEWAY_MODE=local"
      - "PORT=18789"
      - "OPENCLAW_AGENTS_DEFAULTS_MODEL=openai/gpt-4o"
      - "OPENAI_API_KEY=${ceo.apiKey || ''}"
      - "OPENCLAW_TELEGRAM_BOT_TOKEN=${ceo.telegramToken || ''}"
      - "TELEGRAM_BOT_TOKEN=${ceo.telegramToken || ''}"
      - "OPENCLAW_TELEGRAM_ADMIN_IDS=${process.env.TELEGRAM_ADMIN_ID || '722123153'}"
      - "TELEGRAM_ADMIN_IDS=${process.env.TELEGRAM_ADMIN_ID || '722123153'}"
      - "USER_ID=${companyId}"
      - "OPENCLAW_GATEWAY_TOKEN=${companyId}_master_token"
      - "PUBLIC_IP=\${PUBLIC_IP:-localhost}"
    volumes:
      - "${path.join(companyBaseDir, 'proxy.js')}:/root/.openclaw/proxy.js:ro"
      - "${path.join(companyBaseDir, 'openclaw.json')}:/root/.openclaw/openclaw.json:ro"
      - ./workspace:/root/.openclaw/workspace
      - ./workspace:/app/.openclaw/workspace
    deploy:
      resources:
        limits:
          memory: ${memLimit}
          pids: 300
    restart: always
`;
};
