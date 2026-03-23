import { AgentConfig } from './server';

export const generateCompanyCompose = (companyId: string, agents: any[]): string => {
    // Tomamos la configuración del CEO (siempre el primero) para los puertos y tokens globales
    const ceo = agents.find(a => a.role === 'ceo') || agents[0];
    
    // Asignamos recursos robustos para una instancia que manejará múltiples sub-agentes
    // Optimización de recursos para evitar Swap Thrashing en VPS de 8GB
    const memLimit = '8192m'; // 8GB (Total headroom para evitar Swapping)
    const cpuLimit = '2.0';

    return `services:
  main:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: oc-${companyId}
    user: "0:0"
    shm_size: '1gb'
    init: true
    ports:
      - "\${OPENCLAW_GATEWAY_PORT_HOST:-${ceo.port+100}}:18889"
    command: ["/bin/sh", "-c", "node /root/.openclaw/proxy.js & exec node openclaw.mjs gateway --allow-unconfigured"]
    environment:
      - "NODE_OPTIONS=--max-old-space-size=2048"
      - "OPENCLAW_MODE=local"
      - "OPENCLAW_GATEWAY_MODE=local"
      - "OPENCLAW_GATEWAY_PORT=18789"
      - "PORT=18789"
      - "OPENCLAW_AGENTS_DEFAULTS_MODEL=openai/gpt-4o"
      - "OPENAI_API_KEY=${ceo.apiKey || ''}"
      - "TELEGRAM_BOT_TOKEN=${ceo.telegramToken || ''}"
      - "USER_ID=${companyId}"
      - "OPENCLAW_GATEWAY_TOKEN=${companyId}_master_token"
      - "PUBLIC_IP=\${PUBLIC_IP:-localhost}"
    volumes:
      - ./:/root/.openclaw
      - ./workspace:/root/.openclaw/workspace
    deploy:
      resources:
        limits:
          memory: ${memLimit}
          cpus: '${cpuLimit}'
          pids: 500
    restart: always
`;
};
