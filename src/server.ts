import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Cargar variables de entorno (ej. OPENAI_API_KEY)
dotenv.config();

import net from 'net';

const execPromise = util.promisify(exec);
const app = express();
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
    const { userId } = req.body;

    // 1. Validar inputs
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9]+$/.test(userId)) {
        return res.status(400).json({ success: false, error: "Invalid userId format." });
    }

    try {
        const port = await getFreePort(18789);
        const agentDir = path.resolve(__dirname, `../data/agents/${userId}/.openclaw`);
        const workspaceDir = path.resolve(__dirname, `../workspace/${userId}`);
        const composeTemplateSrc = path.resolve(__dirname, '../docker-compose.yml');
        const composeDestDir = path.resolve(__dirname, `../data/agents/${userId}`);

        // 2. Crear directorios
        await fs.mkdir(agentDir, { recursive: true });
        await fs.mkdir(workspaceDir, { recursive: true });

        // 3. Copiar el docker-compose.yml al directorio del usuario
        await fs.copyFile(composeTemplateSrc, path.join(composeDestDir, 'docker-compose.yml'));

        // 4. Ejecutar docker-compose up
        // Usamos variables de entorno en el comando para hidratar la plantilla
        const command = `USER_ID=${userId} HOST_PORT=${port} docker-compose -f ${path.join(composeDestDir, 'docker-compose.yml')} -p agent-${userId} up -d`;

        console.log(`Lanzando agente para usuario ${userId}...`);
        const { stdout, stderr } = await execPromise(command, {
            env: { ...process.env, USER_ID: userId, HOST_PORT: port.toString() }
        });

        if (stderr && stderr.toLowerCase().includes('error')) {
            console.error("Docker error:", stderr);
        }

        // --- AUTOMATIZACIÓN ---

        // 1. Intentar obtener el token (con reintentos)
        let token = "";
        const containerName = `openclaw-agent-${userId}`;

        console.log(`Esperando a que el agente ${userId} genere el token...`);
        for (let i = 0; i < 10; i++) {
            try {
                await new Promise(r => setTimeout(r, 2000)); // Esperar 2s entre intentos
                const { stdout: tokenOut } = await execPromise(`docker exec ${containerName} node dist/index.js dashboard --no-open`);
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
                if (attempts > 24) return clearInterval(interval); // Parar tras 2min (24 * 5s)

                try {
                    const listCmd = `docker exec openclaw-agent-${uid} node dist/index.js devices list --json`;
                    const { stdout: listOut } = await execPromise(listCmd);
                    const devices = JSON.parse(listOut);

                    for (const dev of (devices.pending || [])) {
                        console.log(`Auto-aprobando dispositivo para ${uid}: ${dev.requestId}`);
                        await execPromise(`docker exec openclaw-agent-${uid} node dist/index.js devices approve ${dev.requestId}`);
                    }
                } catch (e) { /* Silencioso */ }
            }, 5000);
        };

        startAutoApprove(userId);

        // 5. Retornar éxito con URL completa (con token)
        const agentUrl = `http://localhost:${port}/#token=${token}`;
        return res.status(200).json({
            success: true,
            userId,
            port,
            token,
            agentUrl,
            message: "Agente aprovisionado y auto-aprobación activada por 2 minutos..."
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
app.post('/api/agents/approve', async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.body;
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9]+$/.test(userId)) return res.status(400).json({ success: false, error: "Invalid userId" });

    try {
        const containerName = `openclaw-agent-${userId}`;
        const listCommand = `docker exec ${containerName} node dist/index.js devices list --json`;
        const { stdout } = await execPromise(listCommand);

        const devices = JSON.parse(stdout);
        if (!devices.pending || devices.pending.length === 0) {
            return res.status(404).json({ success: false, message: "No pending devices found. Please open the agent URL first to generate a request." });
        }

        const approvals = [];
        for (const device of devices.pending) {
            // Aprobar automáticamente cada dispositivo en espera (ideal para SaaS 1:1)
            const approveCommand = `docker exec ${containerName} node dist/index.js devices approve ${device.requestId}`;
            await execPromise(approveCommand);
            approvals.push(device.requestId);
        }

        return res.status(200).json({ success: true, message: `Approved ${approvals.length} device(s).`, approvedIds: approvals });
    } catch (error) {
        console.error("Device approve error:", error);
        return res.status(500).json({ success: false, error: "Failed to list or approve devices." });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Master Server corriendo en http://localhost:${PORT}`);
});
