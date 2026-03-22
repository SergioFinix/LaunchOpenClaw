import { AgentConfig } from './server';

export const generateCompanyCompose = (companyId: string, agents: any[]): string => {
    // Tomamos la configuración del CEO (siempre el primero) para los puertos y tokens globales
    const ceo = agents.find(a => a.role === 'ceo') || agents[0];
    
    // Asignamos recursos robustos para una instancia que manejará múltiples sub-agentes
    const memLimit = '2560m'; // 2.5GB de RAM
    const cpuLimit = '1.5';

    return `services:
  main:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: oc-${companyId}
    user: "0:0"
    shm_size: '512mb'
    privileged: true
    init: true
    network_mode: bridge
    command: ["node", "dist/index.js", "gateway", "--host", "0.0.0.0"]
    ports:
      - "${ceo.port}:18789"
    environment:
      - "NODE_OPTIONS=--max-old-space-size=2048"
      - "OPENCLAW_MODE=local"
      - "OPENCLAW_GATEWAY_MODE=local"
      - "OPENCLAW_GATEWAY_HOST=0.0.0.0"
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
    restart: always
`;
};
