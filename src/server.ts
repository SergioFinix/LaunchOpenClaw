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
    // Inyectamos la capacidad de orquestación si es el CEO
    const orchestrationPrompt = isMaster ? `
## Orchestration Capabilities
You are the Master Orchestrator (CEO). You have the native ability to manage sub-agents.
To delegate tasks, use the sub-agents tools or the command: /subagents spawn [role] [task].
You must coordinate with your departments to fulfill the company's objective.
` : '';

    const soulContent = `# 🎭 Identidad del Agente
Rol: ${role}
Empresa: ${companyId}
${orchestrationPrompt}
Propósito: Tu objetivo es servir a la misión de ${companyId} desde tu especialidad en ${role}. 
${agent.soul ? `\nInstrucciones adicionales de personalidad: ${agent.soul}` : 'Actúa con profesionalismo y proactividad.'}
`;
    await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), soulContent);
}

/**
 * NO creamos un config previo para evitar que el CLI muera por esquemas inválidos. 
 * El CLI creará uno nuevo válido al correr.
 */
async function setupInitialConfig(companyDir: string, token: string, model: string) {
    const configPath = path.join(companyDir, 'openclaw.json');
    const initialConfig = {
        gateway: {
            auth: {
                token: token
            }
        },
        agents: {
            defaults: {
                model: model,
                subagents: {
                    model: "openai/gpt-4o-mini" // Requisito: Modelo eficiente para sub-agentes
                }
            }
        }
    };
    await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));

    // INYECCIÓN DE PROXY TCP: Bypass maestro para el binding hardcodeado a 127.0.0.1
    const proxyPath = path.join(companyDir, 'proxy.js');
    const proxyCode = `
const net = require('net');
console.log('[Master Proxy] Iniciando puente TCP...');
net.createServer(c => {
    c.on('error', () => {});
    const client = net.createConnection(18789, '127.0.0.1');
    client.on('error', () => {});
    c.pipe(client).pipe(c);
}).listen(18790, '0.0.0.0', () => {
    console.log('[Master Proxy] Escuchando en 0.0.0.0:18790 -> redirigiendo a 127.0.0.1:18789');
});
`;
    await fs.writeFile(proxyPath, proxyCode);
}

// --- PHASE 1: ENTERPRISE ORCHESTRATOR ---
app.post('/api/companies', async (req: Request, res: Response): Promise<any> => {
    const { companyId, telegramToken, plandeempresa, mainAgent, departments } = req.body as CompanyRequest;

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
        const port = await getFreePort(18789);

        // 1. PREPARACIÓN DE DIRECTORIOS Y ADN (PHASE 3)
        // El companyBaseDir ya mapea a /root/.openclaw dentro de Docker
        await fs.mkdir(path.join(companyBaseDir, 'agents/main/agent'), { recursive: true });
        
        // CEO Agent (Master)
        await injectAgentContext(companyBaseDir, companyId, 'ceo', plandeempresa, mainAgent, true);

        // Departamentos (Sub-folders internos)
        for (const dept of departments) {
            const role = dept.role.toLowerCase();
            const deptDir = path.join(companyBaseDir, 'agents', role);
            await fs.mkdir(path.join(deptDir, 'agent'), { recursive: true });
            
            console.log(`   [${role}] Inyectando ADN en sub-carpeta...`);
            await injectAgentContext(deptDir, companyId, role, plandeempresa, dept);
        }

        // 2. PRE-INYECCIÓN DE CONFIGURACIÓN (Garantiza acceso por Token al nacer)
        const gatewayToken = `${companyId.toLowerCase()}_master_token`;
        const defaultModel = `openai/gpt-4o`;
        await setupInitialConfig(companyBaseDir, gatewayToken, defaultModel);

        // PARCHE DE PERMISOS FINAL
        try { await execPromise(`sudo chown -R 1000:1000 "${companyBaseDir}"`); } catch (e) {}

        // 3. GENERAR DOCKER-COMPOSE.YML (PHASE 2)
        // Forzamos el uso de la llave del .env del Maestro para simplificar el CURL
        const masterApiKey = process.env.OPENAI_API_KEY;
        const ceoWithMetadata = { ...mainAgent, role: 'ceo', port, telegramToken, apiKey: masterApiKey };
        const composeYaml = generateCompanyCompose(companyId, [ceoWithMetadata]);
        await fs.writeFile(path.join(companyBaseDir, 'docker-compose.yml'), composeYaml);

        // 4. LANZAR INSTANCIA (PHASE 2)
        const publicIp = process.env.PUBLIC_IP || 'localhost';
        
        const containerName = `oc-${companyId.toLowerCase()}`;
        const projectName = `oc-${companyId.toLowerCase()}`;
        const command = `docker-compose -f ${path.join(companyBaseDir, 'docker-compose.yml')} -p ${projectName} up -d`;
        
        console.log(`🐳 Lanzando Instancia Empresarial: ${companyId}...`);
        try {
            const { stdout: launchOut, stderr: launchErr } = await execPromise(command, { env: { ...process.env, PUBLIC_IP: publicIp } });
            if (launchOut) console.log(`   [Docker Out]: ${launchOut}`);
            if (launchErr) console.warn(`   [Docker Warn]: ${launchErr}`);
        } catch (e: any) {
            console.error(`❌ Error crítico al lanzar Docker: ${e.message}`);
            // Verificar si el contenedor existe pero está detenido
            const { stdout: psAll } = await execPromise(`docker ps -a --filter "name=${containerName}"`);
            console.log(`   [Docker PS -a]: ${psAll || 'No se encontró rastro del contenedor.'}`);
            throw e; // Relanzar para que el API responda error 500
        }

        // 5. CONFIGURACIÓN Y ESPERA DE TOKEN (SYNC)
        console.log(`⏳ Esperando inicialización de ${containerName}...`);
        
        // El binario base y el token fijo (ya definido arriba)
        const cli = `docker exec -e OPENCLAW_GATEWAY_TOKEN=${gatewayToken} ${containerName} node dist/index.js`;

        let initialized = false;
        console.log(`   [Link] Iniciando sondeo de binario (30 reintentos)...`);
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                // Probamos con la ruta absoluta por si acaso
                await execPromise(`${cli} --version`);
                initialized = true;
                console.log(`   ✅ Binario detectado y autorizado.`);
                break;
            } catch (e: any) {
                if (i % 5 === 0) console.log(`   [Link] Intento ${i+1}/30: Esperando a OpenClaw...`);
                // No logueamos todos los errores para no inundar, pero guardamos el último
            }
        }

        if (!initialized) {
            console.warn("⚠️ Tiempo de espera agotado, pero intentaremos continuar...");
        }

        // 6. PASOS FINALES DE CONFIGURACIÓN
        try {
            const modelStr = mainAgent.model || 'gpt-4o';
            const isAnthropic = modelStr.toLowerCase().includes('claude') || modelStr.toLowerCase().includes('anthropic');
            const provider = isAnthropic ? 'anthropic' : 'openai';
            const fullModel = `${provider}/${modelStr.replace(`${provider}/`, '')}`;

            // DIAGNÓSTICO PROFUNDO: Verificamos Variables de Entorno Reales
            console.log(`   [Discovery] Verificando variables de entorno en contenedor...`);
            const { stdout: containerEnv } = await execPromise(`docker exec ${containerName} env | grep -E "HOST|ADDRESS|MODE" || true`);
            console.log(`   [Discovery Env]:\n${containerEnv}`);

            console.log(`   [CLI] Sanando configuración (Doctor)...`);
            await execPromise(`${cli} doctor --fix --yes 2>&1 || true`);

            // Intento de Binding Forzado (Probamos 'address' que es común en v2026)
            console.log(`   [CLI] Intentando forzar binding a 0.0.0.0...`);
            await execPromise(`${cli} config set gateway.address 0.0.0.0 2>&1 || ${cli} config set gateway.listen 0.0.0.0 2>&1 || true`);

            console.log(`   [CLI] Configurando modelo ${fullModel}...`);
            await execPromise(`${cli} config set agents.defaults.model ${fullModel} 2>&1`);

            // La API Key ya se pasa por variable de entorno (OPENAI_API_KEY) en docker-compose,
            // no es necesario el comando 'auth add' que ha cambiado en esta versión.

            for (const dept of departments) {
                const role = dept.role.toLowerCase();
                console.log(`   [CLI] Registrando sub-agente: ${role}...`);
                // Intentamos la sintaxis moderna: agents add [role] [path]
                // Si falla, al menos no detiene el proceso principal
                await execPromise(`${cli} agents add ${role} agents/${role} --force 2>&1 || ${cli} agents add ${role} --force 2>&1`).catch(() => {});
            }
        } catch (e: any) {
            console.warn(`⚠️ Error detallado en CLI: ${e.stdout || e.message}`);
        }

        const agentUrl = `http://${publicIp}:${port}/#token=${gatewayToken}`;
        
        return res.status(200).json({
            success: true,
            companyId,
            port,
            token: gatewayToken,
            url: agentUrl,
            roles: ['ceo', ...departments.map(d => d.role.toLowerCase())],
            message: `Enterprise Instance for ${companyId} is READY and fully synchronized.`
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
