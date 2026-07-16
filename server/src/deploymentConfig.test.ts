import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {describe, expect, it} from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

describe("multiplayer deployment configuration", () => {
  it("resolves the configured Dockerfile relative to fly.toml", async () => {
    const flyConfigPath = path.join(repositoryRoot, "server/fly.toml");
    const flyConfig = await readFile(flyConfigPath, "utf8");
    const configuredDockerfile = flyConfig.match(/^\s*dockerfile\s*=\s*"([^"]+)"/m)?.[1];

    expect(configuredDockerfile).toBe("Dockerfile");

    const dockerfilePath = path.resolve(path.dirname(flyConfigPath), configuredDockerfile ?? "");
    await expect(readFile(dockerfilePath, "utf8")).resolves.toContain("FROM node:${NODE_VERSION}");
  });

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
    const flyDnsSetupIndex = operations.indexOf("fly certs setup multi.sudoku.slpixe.com --app sudoku-multiplayer");
    const flyIpLookupIndex = operations.indexOf("fly ips list --app sudoku-multiplayer");
    const domainsFileIndex = operations.indexOf("/Users/slpixe/web/me/domains/main.tf");
    const domainsPushIndex = operations.indexOf("git push origin main");
    const openTofuSuccessIndex = operations.indexOf("pipeline to finish successfully");
    const certificateCheckIndex = operations.indexOf(
      "fly certs check multi.sudoku.slpixe.com --app sudoku-multiplayer",
    );

    expect(deploymentCommand).toContain("fly deploy --ha=false --config server/fly.toml");
    expect(deploymentCommand).toContain("fly scale count 1 --config server/fly.toml");
    expect(flyConfig).toContain("pnpm run deploy:multiplayer");
    expect(flyConfig).toMatch(/\[deploy\][\s\S]*strategy = "immediate"/);
    expect(operations).toContain("Do not override the `immediate` deployment strategy");
    expect(operations).toContain("fly apps create sudoku-multiplayer --org personal");
    expect(operations).toContain("/Users/slpixe/web/me/domains/main.tf");
    expect(operations).toContain("git push origin main");
    expect(operations).toContain("GitLab OpenTofu CI workflow");
    expect(flyIpLookupIndex).toBeGreaterThan(flyDnsSetupIndex);
    expect(domainsFileIndex).toBeGreaterThan(flyIpLookupIndex);
    expect(domainsPushIndex).toBeGreaterThan(domainsFileIndex);
    expect(openTofuSuccessIndex).toBeGreaterThan(domainsPushIndex);
    expect(certificateCheckIndex).toBeGreaterThan(openTofuSuccessIndex);
    expect(operations).not.toContain("op read");
    expect(operations).not.toContain("<FLY_ORGANIZATION>");
    expect(workflow).not.toContain("deploy:multiplayer");
  });
});
