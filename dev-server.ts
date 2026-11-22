import type { Subprocess } from 'bun';

/** A dev server spawned for a browser test, answering at `url`. */
export interface DevServer {
    url: string;
    stop(): Promise<void>;
}

const READY_TIMEOUT_MS = 15_000;
const RETRY_INTERVAL_MS = 25;

/**
 * Spawns `command` with PORT set and resolves once the server answers HTTP,
 * so a test never navigates before it listens. Rejects if the server exits
 * first or does not answer in time.
 */
export async function startDevServer(command: string[], port: number): Promise<DevServer> {
    const server = Bun.spawn(command, {
        cwd: import.meta.dir,
        env: { ...process.env, PORT: String(port) },
        stdout: 'ignore',
        stderr: 'ignore',
    });
    const url = `http://localhost:${port}`;
    const stop = async () => {
        server.kill();
        await server.exited;
    };
    try {
        await waitUntilAnswering(server, url);
    } catch (error) {
        await stop();
        throw error;
    }
    return { url, stop };
}

async function waitUntilAnswering(server: Subprocess, url: string) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (server.exitCode === null && server.signalCode === null) {
        try {
            await fetch(url, { redirect: 'manual' });
            return;
        } catch {
            if (Date.now() > deadline) throw new Error(`${url} did not answer within ${READY_TIMEOUT_MS}ms`);
            await Bun.sleep(RETRY_INTERVAL_MS);
        }
    }
    throw new Error(`the server for ${url} exited with ${server.exitCode ?? server.signalCode} before answering`);
}
