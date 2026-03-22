import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno (ej. OPENAI_API_KEY)
dotenv.config();

import net from 'net';
import { generateCompanyCompose } from './composer';

const execPromise = util.promisify(exec);

// --- ENTERPRISE TYPES ---
export interface AgentConfig {
    role: string;
    model?: string;
    priority?: 'high' | 'low';
    soul?: string;
    skills?: string[];
    apiKey?: string;
}

interface CompanyRequest {
    companyId: string;
    telegramToken?: string;
    llmApiKey?: string; // Nuevo: Llave global para la empresa
    plandeempresa: string;
    mainAgent: AgentConfig; // The CEO
    departments: AgentConfig[];
}

const app = express();
app.use(cors());
app.use(express.json());

// Función para encontrar un puerto libre dinámicamente
const getFreePort = (startPort: number): Promise<number> => {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => {
            resolve(getFreePort(startPort + 1));
        });
        server.listen(startPort, () => {
            const { port } = server.address() as any;
            server.close(() => {
                resolve(port);
            });
        });
    });
};

app.post('/api/agents', async (req: Request, res: Response): Promise<any> => {
    const { userId, telegramToken } = req.body;

    // 1. Validar inputs
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9]+$/.test(userId)) {
        return res.status(400).json({ success: false, error: "Invalid userId format." });
    }

    try {
        const port = await getFreePort(18789);
        const agentBaseDir = path.resolve(__dirname, `../data/agents/${userId}`);
        const agentDir = path.join(agentBaseDir, '.openclaw');
        const workspaceDir = path.join(agentBaseDir, 'workspace');
        const composeTemplateSrc = path.resolve(__dirname, '../docker-compose.yml');
        const composeDestDir = agentBaseDir;

        // 2. Crear directorios
        await fs.mkdir(agentDir, { recursive: true });
        await fs.mkdir(workspaceDir, { recursive: true });
        
        // FORZAR CREACIÓN DE DIRECTORIOS INTERNOS PARA EVITAR EACCES
        // Algunos binarios de OpenClaw intentan crear esta ruta aun en modo local
        await fs.mkdir(path.join(agentDir, 'agents/main/agent'), { recursive: true });

        // PARCHE DE PERMISOS: Asegurar que el usuario 'node' (1000) pueda escribir
        try {
            await execPromise(`sudo chown -R 1000:1000 "${agentBaseDir}"`);
        } catch (e) {
            console.warn("No se pudo cambiar el owner de la carpeta:", e);
        }

        // 3. Copiar el docker-compose.yml al directorio del usuario
        await fs.copyFile(composeTemplateSrc, path.join(composeDestDir, 'docker-compose.yml'));

        // 4. Ejecutar docker-compose up
        // Usamos variables de entorno en el comando para hidratar la plantilla
        const command = `USER_ID=${userId} HOST_PORT=${port} TELEGRAM_BOT_TOKEN=${telegramToken || ''} docker-compose -f ${path.join(composeDestDir, 'docker-compose.yml')} -p agent-${userId} up -d`;

        console.log(`Lanzando agente para usuario ${userId} (Telegram: ${telegramToken ? 'SÍ' : 'NO'})...`);
        const { stdout, stderr } = await execPromise(command, {
            env: { 
                ...process.env, 
                USER_ID: userId, 
                HOST_PORT: port.toString(),
                TELEGRAM_BOT_TOKEN: telegramToken || ''
            }
        });

        if (stdout) console.log(`[Docker Out]: ${stdout}`);
        if (stderr) console.warn(`[Docker Warn/Err]: ${stderr}`);
        console.log(`✅ Comando Docker completado para ${userId}`);

        // --- AUTOMATIZACIÓN ---

        // 1. Intentar obtener el token (con reintentos)
        let token = "";
        const containerName = `openclaw-agent-${userId}`;

        console.log(`Esperando a que el agente ${userId} genere el token...`);
        for (let i = 0; i < 10; i++) {
            try {
                await new Promise(r => setTimeout(r, 2000)); // Esperar 2s entre intentos
                const { stdout: tokenOut } = await execPromise(`docker exec -e NODE_OPTIONS="--max-old-space-size=1024" ${containerName} node dist/index.js dashboard --no-open`);
                const match = tokenOut.match(/#token=([a-f0-9]+)/);
                if (match && match[1]) {
                    token = match[1];
                    break;
                }
            } catch (e) { /* Sigue intentando */ }
        }

        // 2. Lanzar Auto-Aprobación en segundo plano (2 minutos de cortesía)
        const startAutoApprove = (uid: string) => {
            let attempts = 0;
            const interval = setInterval(async () => {
                attempts++;
                if (attempts > 120) return clearInterval(interval); // Parar tras 10min (120 * 5s)

                try {
                    // 1. Auto-aprobar dispositivos de Navegador (Web)
                    // Usamos un heap pequeño (256MB) y un timeout de 10s para no colgar el loop
                    const listCmd = `docker exec -e NODE_OPTIONS="--max-old-space-size=1024" openclaw-agent-${uid} openclaw devices list --json`;
                    const { stdout: listOut } = await (execPromise(listCmd, { timeout: 10000 }) as any);
                    const devices = JSON.parse(listOut);

                    for (const dev of (devices.pending || [])) {
                        console.log(`Auto-aprobando dispositivo para ${uid}: ${dev.requestId}`);
                        await (execPromise(`docker exec -e NODE_OPTIONS="--max-old-space-size=1024" openclaw-agent-${uid} openclaw devices approve ${dev.requestId}`, { timeout: 10000 }) as any);
                    }

                    // 2. Auto-aprobar vinculaciones de Telegram
                    const tgListCmd = `docker exec -e NODE_OPTIONS="--max-old-space-size=1024" openclaw-agent-${uid} openclaw pairing list telegram --json`;
                    const { stdout: tgListOut } = await (execPromise(tgListCmd, { timeout: 10000 }) as any);
                    const tgRequests = JSON.parse(tgListOut);
                    
                    for (const req of (tgRequests.requests || [])) {
                        console.log(`Auto-aprobando Telegram para ${uid}: Code ${req.code}`);
                        await (execPromise(`docker exec -e NODE_OPTIONS="--max-old-space-size=1024" openclaw-agent-${uid} openclaw pairing approve telegram ${req.code}`, { timeout: 10000 }) as any);
                    }
                } catch (e: any) {
                    // Ignorar errores durante los primeros 60 segundos (Fase de arranque/onboard)
                    if (attempts > 4) {
                        if (!e.message.includes("No such container") && !e.message.includes("ETIMEDOUT")) {
                            console.warn(`[AutoApprove ${uid}] Esperando que el binario esté listo...`);
                        }
                    }
                }
            }, 15000);
        };

        startAutoApprove(userId);

        // 5. Retornar éxito con URL completa (con token)
        const publicIp = process.env.PUBLIC_IP || 'localhost';
        const agentUrl = `http://${publicIp}:${port}/#token=${token}`;
        return res.status(200).json({
            success: true,
            userId,
            port,
            token,
            agentUrl,
            message: "Agente aprovisionado y auto-aprobación activada por 10 minutos..."
        });

    } catch (error: any) {
        console.error("Error al aprovisionar agente:", error);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// Nuevo endpoint: Obtener el token del agente
app.get('/api/agents/:userId/token', async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9]+$/.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });

    try {
        const containerName = `openclaw-agent-${userId}`;
        const command = `docker exec ${containerName} node dist/index.js dashboard --no-open`;
        const { stdout } = await execPromise(command);

        // Buscar el token en el texto arrojado por CLI
        const match = stdout.match(/#token=([a-f0-9]+)/);
        if (match && match[1]) {
            return res.status(200).json({ success: true, token: match[1], rawOutput: stdout.trim() });
        } else {
            return res.status(404).json({ success: false, error: "Token not ready yet. Wait a few seconds." });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: "Container offline or starting." });
    }
});

// Nuevo endpoint: Aprobar dispositivo pendiente (Opción 1 de Seguridad)
app.get('/api/agents/:userId/status', async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;
    const containerName = `openclaw-agent-${userId}`;

    try {
        // 1. Verificar si el contenedor existe y está corriendo
        const { stdout: psOut } = await execPromise(`docker ps -q --filter "name=${containerName}"`);
        if (!psOut.trim()) {
            return res.status(200).json({ success: true, status: 'starting', token: '' });
        }

        // 2. Intentar obtener el token del dashboard
        const { stdout: tokenOut } = await execPromise(`docker exec -e NODE_OPTIONS="--max-old-space-size=1024" ${containerName} node dist/index.js dashboard --no-open`);
        const match = tokenOut.match(/#token=([a-f0-9]+)/);
        
        if (match && match[1]) {
            return res.status(200).json({ success: true, status: 'ready', token: match[1] });
        }

        return res.status(200).json({ success: true, status: 'onboarding', token: '' });
    } catch (e) {
        return res.status(200).json({ success: true, status: 'initializing', token: '' });
    }
});

app.post('/api/agents/approve', async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.body;
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9]+$/.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });

    try {
        const containerName = `openclaw-agent-${userId}`;
        const listCommand = `docker exec -e NODE_OPTIONS="--max-old-space-size=1024" ${containerName} openclaw devices list --json`;
        const { stdout } = await (execPromise(listCommand, { timeout: 10000 }) as any);

        const devices = JSON.parse(stdout);
        if (!devices.pending || devices.pending.length === 0) {
            return res.status(404).json({ success: false, message: "No pending devices found. Please open the agent URL first to generate a request." });
        }

        const approvals = [];
        for (const device of devices.pending) {
            const approveCommand = `docker exec -e NODE_OPTIONS="--max-old-space-size=1024" ${containerName} openclaw devices approve ${device.requestId}`;
            await (execPromise(approveCommand, { timeout: 10000 }) as any);
            approvals.push(device.requestId);
        }

        return res.status(200).json({ success: true, message: `Approved ${approvals.length} device(s).`, approvedIds: approvals });
    } catch (error) {
        console.error("Device approve error:", error);
        return res.status(500).json({ success: false, error: "Failed to list or approve devices." });
    }
});

// --- PHASE 3: DNA INJECTION HELPERS ---
async function injectAgentContext(agentDir: string, companyId: string, role: string, businessPlan: string, agent: AgentConfig, isMaster: boolean = false) {
    const workspaceDir = path.join(agentDir, 'workspace');
    await fs.mkdir(workspaceDir, { recursive: true });

    // 1. Inyectar ADN Empresarial (MEMORY.md)
    const memoryContent = `# 🏢 Alineación Estratégica: ${companyId.toUpperCase()}
Misión Global: ${businessPlan}

# 🧬 Tu Rol en el Cluster
Eres el agente especializado en: **${role.toUpperCase()}**.
Prioridad de recursos: ${agent.priority || 'low'}.
${isMaster ? '\nEres el CEO y Orquestador de este cluster empresarial.' : ''}

Este documento guía tu comportamiento estratégico de largo plazo.
`;
    await fs.writeFile(path.join(workspaceDir, 'MEMORY.md'), memoryContent);

    // 2. Inyectar Alma (SOUL.md)
    const soulContent = `# 🎭 Identidad del Agente
Rol: ${role}
Empresa: ${companyId}

Propósito: Tu objetivo es servir a la misión de ${companyId} desde tu especialidad en ${role}. 
${agent.soul ? `\nInstrucciones adicionales de personalidad: ${agent.soul}` : 'Actúa con profesionalismo y proactividad.'}
`;
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), soulContent);
}

/**
 * Parchea el openclaw.json para registrar los sub-agentes locales y configurar el modelo
 */
async function patchOpenClawConfig(companyBaseDir: string, departments: AgentConfig[], mainAgent: AgentConfig) {
    const configPath = path.join(companyBaseDir, '.openclaw', 'openclaw.json');
    const authPath = path.join(companyBaseDir, '.openclaw', 'agents/main/agent/auth-profiles.json');
    
    let config: any = { agents: {}, gateway: { host: "0.0.0.0" } };
    try {
        const existing = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(existing);
    } catch (e) {}

    if (!config.agents) config.agents = {};

    // 1. Configurar Model/Provider principal
    // Forzamos OpenAI por defecto como pidió el usuario
    const modelStr = mainAgent.model || 'gpt-4o';
    const isAnthropic = modelStr.toLowerCase().includes('claude') || modelStr.toLowerCase().includes('anthropic');
    const provider = isAnthropic ? 'anthropic' : 'openai';
    
    config.provider = provider;
    config.model = modelStr;

    // 2. Registrar cada departamento
    for (const dept of departments) {
        const role = dept.role.toLowerCase();
        config.agents[role] = { path: `agents/${role}` };
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // 3. Crear Perfil de Autenticación si hay API Key
    if (mainAgent.apiKey) {
        const authConfig = {
            [provider]: {
                apiKey: mainAgent.apiKey
            }
        };
        await fs.mkdir(path.dirname(authPath), { recursive: true });
        await fs.writeFile(authPath, JSON.stringify(authConfig, null, 2));
    }
}

// --- PHASE 1: ENTERPRISE ORCHESTRATOR ---
app.post('/api/companies', async (req: Request, res: Response): Promise<any> => {
    const { companyId, telegramToken, llmApiKey, plandeempresa, mainAgent, departments } = req.body as CompanyRequest;

    // 1. Validar inputs básicos
    if (!companyId || !/^[a-zA-Z0-9_-]+$/.test(companyId)) {
        return res.status(400).json({ success: false, error: "Invalid companyId format." });
    }

    if (!plandeempresa) {
        return res.status(400).json({ success: false, error: "Missing plandeempresa (Business DNA)." });
    }

    try {
        console.log(`🏗️  Creando Instancia Consolidada: ${companyId}...`);
        
        const companyBaseDir = path.resolve(__dirname, `../data/agents/${companyId}`);
        const masterAgentDir = path.join(companyBaseDir, '.openclaw');
        const port = await getFreePort(18789);

        // 1. PREPARACIÓN DE DIRECTORIOS
        await fs.mkdir(path.join(masterAgentDir, 'agents/main/agent'), { recursive: true });
        
        // CEO Agent (Master)
        await injectAgentContext(masterAgentDir, companyId, 'ceo', plandeempresa, mainAgent, true);

        // Departamentos (Sub-folders internos)
        for (const dept of departments) {
            const role = dept.role.toLowerCase();
            const deptDir = path.join(masterAgentDir, 'agents', role);
            await fs.mkdir(path.join(deptDir, 'agent'), { recursive: true });
            
            console.log(`   [${role}] Inyectando ADN en sub-carpeta...`);
            await injectAgentContext(deptDir, companyId, role, plandeempresa, dept);
        }

        // 2. REGISTRO DE SUB-AGENTES Y MODELO (openclaw.json)
        await patchOpenClawConfig(companyBaseDir, departments, mainAgent);

        // PARCHE DE PERMISOS FINAL
        try { await execPromise(`sudo chown -R 1000:1000 "${companyBaseDir}"`); } catch (e) {}

        // 3. GENERAR DOCKER-COMPOSE.YML (PHASE 2)
        const ceoWithMetadata = { ...mainAgent, role: 'ceo', port, telegramToken, apiKey: mainAgent.apiKey || llmApiKey || process.env.OPENAI_API_KEY };
        const composeYaml = generateCompanyCompose(companyId, [ceoWithMetadata]);
        await fs.writeFile(path.join(companyBaseDir, 'docker-compose.yml'), composeYaml);

        // 4. LANZAR INSTANCIA (PHASE 2)
        const publicIp = process.env.PUBLIC_IP || 'localhost';
        const command = `docker-compose -f ${path.join(companyBaseDir, 'docker-compose.yml')} -p oc-${companyId} up -d`;
        
        console.log(`🐳 Lanzando Instancia Empresarial: ${companyId} en puerto ${port}...`);
        await execPromise(command, { env: { ...process.env, PUBLIC_IP: publicIp } });

        return res.status(200).json({
            success: true,
            companyId,
            url: `http://${publicIp}:${port}/`,
            roles: ['ceo', ...departments.map(d => d.role.toLowerCase())],
            message: `Consolidated Instance for ${companyId} is online.`
        });

    } catch (error: any) {
        console.error("Error en Phase 1 (Enterprise):", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Master Server corriendo en http://localhost:${PORT}`);
});
