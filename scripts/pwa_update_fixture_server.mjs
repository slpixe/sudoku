import {spawnSync} from "node:child_process";
import {createReadStream} from "node:fs";
import {mkdtemp, rm, stat} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = await mkdtemp(path.join(tmpdir(), "sudoku-pwa-update-"));
const port = Number.parseInt(process.env.PWA_UPDATE_PORT ?? "4390", 10);

if (!Number.isInteger(port) || port < 1025 || port > 65535) {
  throw new Error("PWA_UPDATE_PORT must be a valid non-privileged port");
}

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
  }
}

run("pnpm", ["run", "build:core"]);
run("pnpm", ["run", "build:protocol"]);

for (const buildId of ["old", "new"]) {
  run("pnpm", ["exec", "vite", "build", "--outDir", path.join(fixtureRoot, buildId), "--emptyOutDir"], {
    ...process.env,
    PWA_E2E_BUILD_ID: buildId,
  });
}

let activeBuildId = "old";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://pwa-update.test");

  if (request.method === "POST" && url.pathname === "/__pwa-test/switch-to-new") {
    activeBuildId = "new";
    sendJson(response, 200, {buildId: activeBuildId});
    return;
  }

  if (request.method === "GET" && url.pathname === "/__pwa-test/version") {
    sendJson(response, 200, {buildId: activeBuildId});
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, {status: "method_not_allowed"});
    return;
  }

  const activeRoot = path.join(fixtureRoot, activeBuildId);
  const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const candidate = path.resolve(activeRoot, requestedPath);
  let filePath = candidate.startsWith(`${activeRoot}${path.sep}`) || candidate === activeRoot ? candidate : "";

  try {
    if (!filePath || !(await stat(filePath)).isFile()) {
      filePath = path.join(activeRoot, "index.html");
    }
  } catch {
    filePath = path.join(activeRoot, "index.html");
  }

  const extension = path.extname(filePath);
  const noCache = path.basename(filePath) === "index.html" || path.basename(filePath) === "sw.js";
  response.writeHead(200, {
    "Cache-Control": noCache ? "no-cache" : "public, max-age=31536000, immutable",
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await rm(fixtureRoot, {recursive: true, force: true});
}

await new Promise((resolve, reject) => {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void shutdown().then(resolve, reject);
  };

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, stop);
  }

  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`PWA update fixture listening on http://127.0.0.1:${port}\n`);
  });
});
