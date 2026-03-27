import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno (ej. OPENAI_API_KEY)...
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
        // startAutoApprove(userId); // REMOVED: Using allowFrom in newer versions

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
async function injectAgentContext(workspaceDir: string, companyId: string, role: string, businessPlan: string, agent: AgentConfig, allRoles: string[] = [], isMaster: boolean = false) {
    await fs.mkdir(workspaceDir, { recursive: true });

    if (isMaster) {
        // --- MAIN AGENT WORKSPACE ---
        
        // 1. IDENTITY.md (Nombre y Persona)
        const identityContent = `# 🆔 Identidad del Agente
Nombre: CEO ${companyId.toUpperCase()}
Emoji: 🏢
Avatar: default-ceo
Descripción: Orquestador Maestro de ${companyId}
`;
        await fs.writeFile(path.join(workspaceDir, 'IDENTITY.md'), identityContent);

        // 2. SOUL.md (Personalidad y Tono)
        const soulContent = `# 🎭 Soul (Personalidad)
Eres el CEO y Orquestador Maestro de la empresa ${companyId}. 
Tu tono es ejecutivo, proactivo y estratégico. 
Misión Global: ${businessPlan}

## Instrucciones de Personalidad
${agent.soul || 'Actúa con liderazgo y visión de negocio.'}
`;
        await fs.writeFile(path.join(workspaceDir, 'SOUL.md'), soulContent);

        // 3. AGENTS.md (Directorio de Equipo y SOPs)
        const teamList = allRoles.filter(r => r.toLowerCase() !== 'ceo' && r.toLowerCase() !== 'main').map(r => `- **${r.toUpperCase()}**: Departamento especializado.`).join('\n');
        const agentsContent = `# 📋 Directorio de Equipo y SOPs
Tienes a tu disposición el siguiente equipo de agentes para delegar tareas:
${teamList}

## ⚠️ PROHIBICIÓN CRÍTICA
- **NUNCA** intentes contactar a los sub-agentes por el canal de Telegram (ej. no uses @ventas).
- Los departamentos NO son canales de chat; son procesos internos de tu cluster. No intentes enviarles mensajes directos por chat.
- Si intentas usar Telegram para hablar con ellos, el sistema fallará porque no son canales de mensajería externa.

## Instrucciones de Delegación
1. Eres el responsable de coordinar a todos los sub-agentes del cluster.
2. Utiliza la herramienta de sesiones **para** asignar tareas: \`/subagents spawn [rol] "[tarea específica]" \`.
3. Mantén siempre el enfoque en cumplir la misión: ${businessPlan}.

## Capacidades de Orquestación
- Puedes spawnear sub-agentes usando el comando de texto o la herramienta interna \`sessions_spawn\`.
- Debes revisar el progreso de los departamentos periódicamente.
`;
        await fs.writeFile(path.join(workspaceDir, 'AGENTS.md'), agentsContent);

        // 4. USER.md (Contexto del Usuario)
        const userContent = `# 👤 Sobre el Usuario
Este agente pertenece a la infraestructura privada de InstantStartup. 
El usuario interactúa principalmente a través de la interfaz de Telegram o el Dashboard.
`;
        await fs.writeFile(path.join(workspaceDir, 'USER.md'), userContent);

    } else {
        // --- SUB-AGENT WORKSPACE ---

        // 1. AGENTS.md (Instrucciones operativas específicas)
        const agentsContent = `# 📋 Instrucciones Operativas - Especialidad: ${role.toUpperCase()}
Empresa: ${companyId}
Misión de la Empresa: ${businessPlan}

## Tu Misión Específica
Eres el agente especializado en **${role}**. 
Tu objetivo es ejecutar las tareas asignadas por el CEO con la máxima precisión en tu área.

## Reglas de Comportamiento
- Ejecuta solo lo solicitado en tu área de expertiz.
- Reporta resultados claros al CEO una vez finalizada la tarea.
`;
        await fs.writeFile(path.join(workspaceDir, 'AGENTS.md'), agentsContent);

        // 2. TOOLS.md (Convenciones de herramientas)
        const toolsContent = `# 🛠️ Convenciones de Herramientas
- Utiliza las herramientas disponibles para completar tu tarea de ${role}.
- Si necesitas recursos adicionales, solicítalos al CEO.
`;
        await fs.writeFile(path.join(workspaceDir, 'TOOLS.md'), toolsContent);
    }
}

/**
 * NO creamos un config previo para evitar que el CLI muera por esquemas inválidos. 
 * El CLI creará uno nuevo válido al correr.
 */
async function setupInitialConfig(companyDir: string, token: string, model: string, port: number, telegramToken: string = '', departments: any[] = []) {
    const configPath = path.join(companyDir, 'openclaw.json');
    // 1. GENERAR CONFIGURACIÓN (PHASE 7.0)
    const allAgentIds = ["main", ...departments.map(d => d.role.toLowerCase())];

    const initialConfig: any = {
        gateway: {
            mode: "local",
            port: 18789, // Interno
            auth: {
                token: token
            },
            controlUi: {
                allowInsecureAuth: true,
                dangerouslyDisableDeviceAuth: true,
                allowedOrigins: ["*"]
            }
        },
        channels: {
            telegram: {
                enabled: !!telegramToken,
                botToken: telegramToken,
                dmPolicy: "allowlist",
                allowFrom: [Number(process.env.TELEGRAM_ADMIN_ID || 722123153)] // CRITICAL: Numeric type for Engine
            }
        },
        commands: {
            text: true // Permite que el bot procese comandos de texto como /subagents spawn
        },
        agents: {
            defaults: {
                model: model.includes('/') ? model : `openai/${model}`,
                maxConcurrent: 4, // Global limit inside defaults
                subagents: {
                    model: "openai/gpt-4o-mini",
                    maxConcurrent: 8,
                    maxSpawnDepth: 2,
                    maxChildrenPerAgent: 8,
                    runTimeoutSeconds: 900
                }
            },
            list: [
                {
                    id: "main",
                    default: true, // Define este agente como el principal para la UI/Gateway
                    model: model.includes('/') ? model : `openai/${model}`,
                    workspace: "~/.openclaw/workspace",
                    subagents: {
                        allowAgents: allAgentIds.filter(id => id !== "main") // Explicit list for maximum compatibility
                    }
                },
                ...departments.map(dept => ({
                    id: dept.role.toLowerCase(),
                    model: dept.model?.includes('/') ? dept.model : `openai/${dept.model || 'gpt-4o-mini'}`,
                    workspace: `~/.openclaw/workspace-${dept.role.toLowerCase()}`,
                    subagents: {
                        allowAgents: allAgentIds.filter(id => id !== dept.role.toLowerCase())
                    }
                }))
            ]
        },
        bindings: [
            {
                agentId: "main",
                match: { channel: "telegram" }
            }
        ],
        tools: {
            profile: "full",
            sessions: {
                visibility: "tree"
            },
            agentToAgent: {
                enabled: false // Desactivado para evitar el bug de bloqueo; usamos subagents spawn jerárquico
            }
        },
        session: {
            agentToAgent: {
                maxPingPongTurns: 5
            }
        }
    };
    await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));

    // 2.5 ABRIR FIREWALL UFW DINÁMICAMENTE
    try {
        console.log(`   [Firewall] Abriendo puerto host: ${port}...`);
        await execPromise(`sudo ufw allow ${port}/tcp`);
    } catch (e) { }
}

// --- TELEGRAM PAIRING AUTO-APPROVER ---
function startTelegramPairingWatcher(companyId: string, configPath: string) {
    const containerName = `oc-${companyId.toLowerCase()}`;
    const { spawn } = require('child_process');

    console.log(`👁️  [Pairing Watcher] Iniciando para ${companyId}...`);

    const logStream = spawn('docker', ['logs', '-f', containerName]);

    let pendingUserId = '';
    let pendingPairingCode = '';

    const processLine = async (line: string) => {
        const userIdMatch = line.match(/Your Telegram user id:\s*(\d+)/);
        if (userIdMatch) {
            pendingUserId = userIdMatch[1];
            console.log(`👁️  [Pairing Watcher] User ID detectado: ${pendingUserId}`);
        }

        const pairingMatch = line.match(/Pairing code:\s*([A-Z0-9]{4,12})/);
        if (pairingMatch) {
            pendingPairingCode = pairingMatch[1];
            console.log(`👁️  [Pairing Watcher] Pairing code detectado: ${pendingPairingCode}`);
        }

        if (pendingUserId && pendingPairingCode) {
            const userId = pendingUserId;
            const code = pendingPairingCode;
            pendingUserId = '';
            pendingPairingCode = '';

            console.log(`🤝 [Pairing Watcher] Auto-aprobando user ${userId} con code ${code}...`);

            // 1. Aprobar el pairing dentro del contenedor (sin restart, ~1 seg)
            try {
                await execPromise(`docker exec ${containerName} openclaw pairing approve telegram ${code}`, { timeout: 10000 });
                console.log(`✅ [Pairing Watcher] Pairing ${code} aprobado correctamente.`);
            } catch (e: any) {
                console.warn(`⚠️  [Pairing Watcher] Error en pairing approve: ${e.message}`);
            }

            // 2. Persistir en openclaw.json del host (para sobrevivir restarts futuros)
            try {
                const raw = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(raw);
                const allowFrom: any[] = config?.channels?.telegram?.allowFrom ?? [];
                const numericUserId = Number(userId);
                if (!allowFrom.includes(numericUserId)) {
                    allowFrom.push(numericUserId);
                    config.channels.telegram.allowFrom = allowFrom;
                    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
                    console.log(`✅ [Pairing Watcher] User ${numericUserId} persistido en allowFrom de openclaw.json.`);
                }
            } catch (e: any) {
                console.warn(`⚠️  [Pairing Watcher] Error actualizando openclaw.json: ${e.message}`);
            }
        }
    };

    let buffer = '';
    const handleData = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(line => processLine(line));
    };

    logStream.stdout.on('data', handleData);
    logStream.stderr.on('data', handleData);
    logStream.on('error', (err: Error) => {
        console.warn(`⚠️  [Pairing Watcher] Stream error para ${companyId}: ${err.message}`);
    });
    logStream.on('close', () => {
        console.log(`👁️  [Pairing Watcher] Stream cerrado para ${companyId}.`);
    });
}

// --- PHASE 1: ENTERPRISE ORCHESTRATOR ---
app.post('/api/companies', async (req: Request, res: Response): Promise<any> => {
    const { companyId: rawId, telegramToken, plandeempresa, mainAgent, departments } = req.body as CompanyRequest;
    const companyId = (rawId || '').toLowerCase();

    // 1. Validar inputs básicos
    if (!companyId || !/^[a-zA-Z0-9_-]+$/.test(companyId)) {
        return res.status(400).json({ success: false, error: "Invalid companyId format." });
    }

    if (!plandeempresa) {
        return res.status(400).json({ success: false, error: "Missing plandeempresa (Business DNA)." });
    }

    try {
        const companyBaseDir = path.resolve(__dirname, `../data/agents/${companyId}`);

        console.log(`🏗️  Creando Instancia Consolidada: ${companyId}...`);

        // 1. PREPARACIÓN DE DIRECTORIOS Y ADN (PHASE 3)
        // Main Agent Workspace
        const mainWorkspaceDir = path.join(companyBaseDir, 'workspace');
        // 1. INYECTAR ADN EN CADA WORKSPACE (PHASE 2)
        const allRoles = ["main", ...departments.map(d => d.role.toLowerCase())];
        
        console.log(`🧬 Inyectando ADN en el CEO...`);
        await fs.mkdir(mainWorkspaceDir, { recursive: true }); // Ensure main workspace exists
        await injectAgentContext(mainWorkspaceDir, companyId, 'ceo', plandeempresa, mainAgent, allRoles, true);

        for (const dept of departments) {
            const role = dept.role.toLowerCase();
            const deptWorkspaceDir = path.join(companyBaseDir, `workspace-${role}`);
            await fs.mkdir(deptWorkspaceDir, { recursive: true }); // Ensure department workspace exists
            console.log(`   [${role}] Inyectando ADN en sub-workspace...`);
            await injectAgentContext(deptWorkspaceDir, companyId, role, plandeempresa, dept, allRoles, false);
        }

        // 2. PRE-INYECCIÓN DE CONFIGURACIÓN (Garantiza acceso por Token al nacer)
        const port = await getFreePort(18890); // Rango superior para evitar colisiones
        const gatewayToken = `${companyId.toLowerCase()}_master_token`;
        await setupInitialConfig(companyBaseDir, gatewayToken, mainAgent.model || "openai/gpt-4o", port, telegramToken, departments);

        // PARCHE DE PERMISOS FINAL
        try { await execPromise(`sudo chown -R 1000:1000 "${companyBaseDir}"`); } catch (e) { }

        // 3. GENERAR DOCKER-COMPOSE.YML (PHASE 2)
        // Forzamos el uso de la llave del .env del Maestro para simplificar el CURL
        const masterApiKey = process.env.OPENAI_API_KEY;
        const ceoWithMetadata = { ...mainAgent, role: 'ceo', port, telegramToken, apiKey: masterApiKey };
        const composeYaml = await generateCompanyCompose(companyId, companyBaseDir, [ceoWithMetadata]);
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

        // 5. SONDEO EN TIEMPO REAL BASADO EN LOG STREAMING (READINESS CHECK SUPREMO)
        console.log(`⏳ Escaneando signos vitales en tiempo real del motor ${containerName}...`);

        let ready = false;
        try {
            ready = await new Promise<boolean>((resolve) => {
                const { spawn } = require('child_process');
                // docker logs -f streamea los logs en tiempo real sin comer cpu
                const logStream = spawn('docker', ['logs', '-f', containerName]);

                // Timeout absoluto de 480 segundos propuesto por el usuario (8 minutos)
                const timeout = setTimeout(() => {
                    logStream.kill();
                    resolve(false);
                }, 480000);

                const checkOutput = (data: Buffer) => {
                    if (data.toString().includes("listening on ws://")) {
                        clearTimeout(timeout);
                        logStream.kill();
                        resolve(true);
                    }
                };

                // OpenClaw a veces imprime logs en canal error o stdout, escuchamos ambos
                logStream.stdout.on('data', checkOutput);
                logStream.stderr.on('data', checkOutput);

                logStream.on('error', () => {
                    clearTimeout(timeout);
                    logStream.kill();
                    resolve(false);
                });
            });
        } catch (e) {
            console.error("Error en el log stream:", e);
        }

        if (!ready) {
            console.error(`❌ El motor de ${companyId} no reportó estado "listening" en 120 segundos.`);
            return res.status(503).json({
                success: false,
                error: "El motor está tardando demasiado en iniciar. Por favor revisa los logs del contenedor.",
                url: `http://${publicIp}:${port}/#token=${gatewayToken}`
            });
        }

        const agentUrl = `http://${publicIp}:${port}/#token=${gatewayToken}`;

        // --- BACKGROUND TELEGRAM PAIRING WATCHER ---
        if (telegramToken && telegramToken.trim() !== '') {
            const configPath = path.join(companyBaseDir, 'openclaw.json');
            startTelegramPairingWatcher(companyId, configPath);
        }

        res.status(200).json({
            success: true,
            companyId: companyId,
            token: gatewayToken,
            url: `http://${publicIp}:${port}/#token=${gatewayToken}`
        });

    } catch (error: any) {
        console.error("Error creating company:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GLOBAL WATCHER: Escanea TODOS los contenedores activos oc-* en busca de peticiones de Telegram.
 * Esto asegura que la auto-aprobación sobreviva a reinicios del Maestro.
 */
// startGlobalTelegramWatcher(); // REMOVED: Using allowFrom in newer versions

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`ðŸš€ Master Server corriendo en http://0.0.0.0:${PORT}`);
    // startGlobalTelegramWatcher();
});
