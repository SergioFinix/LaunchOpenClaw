import { AgentConfig } from './server';

export const generateCompanyCompose = (companyId: string, agents: any[]): string => {
    // Tomamos la configuración del CEO (siempre el primero) para los puertos y tokens globales
    const ceo = agents.find(a => a.role === 'ceo') || agents[0];
    
    // Asignamos recursos robustos para una instancia que manejará múltiples sub-agentes
    const memLimit = '4096m'; // 4GB de RAM (Hardening contra picos de sub-agentes)
    const cpuLimit = '1.5';

    return `services:
  main:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: oc-${companyId}
    user: "0:0"
    shm_size: '512mb'
    init: true
    ports:
      - "\${OPENCLAW_GATEWAY_PORT_HOST:-${ceo.port}}:18889"
    command: ["/bin/sh", "-c", "node /root/.openclaw/proxy.js & node openclaw.mjs gateway --allow-unconfigured"]
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
      - ./:/root/.openclaw
      - ./:/app/.openclaw
      - ./workspace:/root/.openclaw/workspace
      - ./workspace:/app/.openclaw/workspace
    deploy:
      resources:
        limits:
          memory: ${memLimit}
          cpus: '${cpuLimit}'
          pids: 300
    restart: always
`;
};
