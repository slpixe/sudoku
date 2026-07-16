import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {describe, expect, it} from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("multiplayer deployment configuration", () => {
  it("runs production and release processes directly with Node", async () => {
    const [dockerfile, flyConfig] = await Promise.all([
      readRepositoryFile("server/Dockerfile"),
      readRepositoryFile("server/fly.toml"),
    ]);

    expect(dockerfile).toContain("FROM node:${NODE_VERSION} AS runtime");
    expect(dockerfile).toContain('CMD ["node", "server/dist/index.js"]');
    expect(flyConfig).toContain('release_command = "node server/dist/db/migrate.js"');
  });

  it("requires the checked-in one-Machine deployment workflow", async () => {
    const [packageContents, flyConfig, workflow, operations] = await Promise.all([
      readRepositoryFile("package.json"),
      readRepositoryFile("server/fly.toml"),
      readRepositoryFile(".github/workflows/run_tests.yaml"),
      readRepositoryFile("docs/multiplayer-operations.md"),
    ]);
    const packageJson = JSON.parse(packageContents) as {scripts?: Record<string, string>};
    const deploymentCommand = packageJson.scripts?.["deploy:multiplayer"];

    expect(deploymentCommand).toContain("fly deploy --ha=false --config server/fly.toml");
    expect(deploymentCommand).toContain("fly scale count 1 --config server/fly.toml");
    expect(flyConfig).toContain("pnpm run deploy:multiplayer");
    expect(flyConfig).toMatch(/\[deploy\][\s\S]*strategy = "immediate"/);
    expect(operations).toContain("Do not override the `immediate` deployment strategy");
    expect(operations).toContain("fly apps create sudoku-multiplayer --org personal");
    expect(operations).toContain("/Users/slpixe/web/me/domains/main.tf");
    expect(operations).toContain("git push origin main");
    expect(operations).not.toContain("op read");
    expect(operations).not.toContain("<FLY_ORGANIZATION>");
    expect(workflow).not.toContain("deploy:multiplayer");
  });
});
