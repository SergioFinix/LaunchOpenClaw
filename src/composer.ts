import { AgentConfig } from './server';

export const generateCompanyCompose = (companyId: string, agents: any[]): string => {
    let services = '';

    for (const agent of agents) {
        const memLimit = agent.priority === 'high' ? '1024m' : '512m';
        const cpuLimit = agent.priority === 'high' ? '1.0' : '0.5';
        
        // El puerto interno de OpenClaw siempre es 18789
        // El puerto externo es el que asignó el Maestro dinámicamente
        services += `
  ${agent.role}:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: oc-${companyId}-${agent.role}
    user: "0:0"
    shm_size: '512mb'
    privileged: true
    init: true
    network_mode: bridge
    ports:
      - "${agent.port}:18789"
    environment:
      - NODE_OPTIONS=--max-old-space-size=${agent.priority === 'high' ? 1024 : 512}
      - OPENCLAW_MODE=local
      - OPENCLAW_GATEWAY_MODE=local
      - OPENAI_API_KEY=${agent.apiKey || ''}
      - TELEGRAM_BOT_TOKEN=${agent.telegramToken || ''}
      - USER_ID=${companyId}-${agent.role}
      - PUBLIC_IP=\${PUBLIC_IP:-localhost}
    volumes:
      - ./${agent.role}/.openclaw:/root/.openclaw
      - ./${agent.role}/workspace:/root/.openclaw/workspace
    deploy:
      resources:
        limits:
          memory: ${memLimit}
          cpus: '${cpuLimit}'
    restart: always
`;
    }

    return `version: '3.8'
services:
${services}
`;
};
