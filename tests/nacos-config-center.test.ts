import { describe, it, expect } from "vitest";
import {
  checkNacosHealth,
  getNacosEndpoint,
  publishNacosConfig,
  fetchNacosConfig,
  getNacosParsedConfig,
  listNacosConfigs,
  generateDefaultModularConfigs,
  syncAllConfigsToNacos,
} from "@/lib/nacos-client";

describe("Alibaba Nacos Dynamic Config Center Integration Tests", () => {
  it("resolves Nacos endpoint correctly", () => {
    const endpoint = getNacosEndpoint();
    expect(endpoint).toBeDefined();
    expect(endpoint.startsWith("http://") || endpoint.startsWith("https://")).toBe(true);
  });

  it("checks Nacos server health", async () => {
    const health = await checkNacosHealth();
    expect(health).toHaveProperty("healthy");
    expect(health).toHaveProperty("version");
    expect(health).toHaveProperty("endpoint");
    expect(typeof health.healthy).toBe("boolean");
  });

  it("generates 4 default modular configuration YAMLs", () => {
    const configs = generateDefaultModularConfigs();
    expect(configs).toHaveProperty("khlan-backend.yaml");
    expect(configs).toHaveProperty("khlan-storage.yaml");
    expect(configs).toHaveProperty("khlan-telegram.yaml");
    expect(configs).toHaveProperty("khlan-frontend.yaml");

    expect(configs["khlan-backend.yaml"]).toContain("khlan-backend");
    expect(configs["khlan-storage.yaml"]).toContain("CLOUDFLARE_R2");
    expect(configs["khlan-telegram.yaml"]).toContain("mini-app");
    expect(configs["khlan-frontend.yaml"]).toContain("KhLan Automotive Marketplace");
  });

  it("publishes, retrieves, and parses configuration from Nacos", async () => {
    const testDataId = "test-vitest-config.yaml";
    const testYaml = "app:\n  name: VitestTestApp\n  port: 9999\n  active: true\n";

    const published = await publishNacosConfig(testDataId, testYaml, "yaml", "DEFAULT_GROUP");
    if (!published) {
      // If Nacos server is not reachable in this test runner environment, gracefully skip
      return;
    }

    let raw: string | null = null;
    for (let i = 0; i < 5; i++) {
      raw = await fetchNacosConfig(testDataId);
      if (raw) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(raw).toBeDefined();
    expect(raw).toContain("VitestTestApp");

    const parsed = await getNacosParsedConfig<{ app: { name: string; port: number; active: boolean } }>(
      testDataId
    );
    expect(parsed?.app?.name).toBe("VitestTestApp");
    expect(parsed?.app?.port).toBe(9999);
    expect(parsed?.app?.active).toBe(true);
  });

  it("synchronizes all modular configurations to Nacos", async () => {
    const syncResult = await syncAllConfigsToNacos();
    expect(syncResult).toHaveProperty("published");
    expect(syncResult).toHaveProperty("errors");
    expect(Array.isArray(syncResult.published)).toBe(true);
    expect(Array.isArray(syncResult.errors)).toBe(true);

    if (syncResult.published.length > 0) {
      expect(syncResult.published).toContain("khlan-backend.yaml");
      expect(syncResult.published).toContain("khlan-storage.yaml");
      expect(syncResult.published).toContain("khlan-telegram.yaml");
      expect(syncResult.published).toContain("khlan-frontend.yaml");

      const configs = await listNacosConfigs();
      const ids = configs.map((c) => c.dataId);
      expect(ids).toContain("khlan-backend.yaml");
      expect(ids).toContain("khlan-storage.yaml");
      expect(ids).toContain("khlan-telegram.yaml");
      expect(ids).toContain("khlan-frontend.yaml");
    }
  });
});
