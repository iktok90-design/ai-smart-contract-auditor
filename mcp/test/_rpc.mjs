// Minimal MCP/JSON-RPC client for tests: spawn a server's dist/index.js, do the
// initialize -> tools/list -> tools/call handshake over stdio, and return the
// listed tools plus the text of one tool invocation. Zero dependencies; runs
// fully offline (RUGPROOF_OFFLINE=1 is set for the child).
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = resolve(here, "..");

export function serverDist(name) {
  return resolve(MCP_DIR, `${name}-mcp`, "dist", "index.js");
}

export function hasServer(name) {
  return existsSync(serverDist(name));
}

/**
 * @returns {Promise<{tools: string[], invokeText: string|null, error: string|null}>}
 */
export function callServer(name, tool, args, timeoutMs = 8000) {
  const dist = serverDist(name);
  return new Promise((resolveResult) => {
    const proc = spawn("node", [dist], {
      env: { ...process.env, RUGPROOF_OFFLINE: "1" },
    });
    let buf = "";
    let tools = [];
    let done = false;

    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { proc.kill("SIGKILL"); } catch {}
      resolveResult(r);
    };

    const timer = setTimeout(
      () => finish({ tools, invokeText: null, error: `timeout after ${timeoutMs}ms` }),
      timeoutMs,
    );

    proc.on("error", (err) => finish({ tools, invokeText: null, error: String(err) }));
    proc.stderr.on("data", () => {});

    proc.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.id === 1 && msg.result) {
          send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
          send(proc, { jsonrpc: "2.0", id: 2, method: "tools/list" });
        }
        if (msg.id === 2 && msg.result) {
          tools = (msg.result.tools ?? []).map((t) => t.name);
          if (!tool) { finish({ tools, invokeText: null, error: null }); return; }
          send(proc, {
            jsonrpc: "2.0", id: 3, method: "tools/call",
            params: { name: tool, arguments: args ?? {} },
          });
        }
        if (msg.id === 3) {
          if (msg.error) {
            finish({ tools, invokeText: null, error: `${msg.error.code}: ${msg.error.message}` });
          } else {
            const text = msg.result?.content?.[0]?.text ?? "";
            finish({ tools, invokeText: text, error: null });
          }
          return;
        }
      }
    });

    send(proc, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "auditsentry-mcp-test", version: "0.2.0" },
      },
    });
  });
}

function send(proc, msg) {
  proc.stdin?.write(JSON.stringify(msg) + "\n");
}
