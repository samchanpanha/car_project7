import dotenv from "dotenv";
dotenv.config();

import {
  checkNacosHealth,
  syncAllConfigsToNacos,
  listNacosConfigs,
  getNacosParsedConfig,
  getNacosEndpoint,
} from "../src/lib/nacos-client";

async function main() {
  console.log("==================================================");
  console.log("🚀 Alibaba Nacos Centralized Configuration Sync");
  console.log("==================================================");
  console.log(`Target Nacos Server: ${getNacosEndpoint()}`);

  const health = await checkNacosHealth();
  if (!health.healthy) {
    console.error(`❌ Cannot connect to Nacos server at ${health.endpoint}`);
    console.error("   Ensure the khlan-nacos container is running: docker compose up -d nacos");
    process.exit(1);
  }

  console.log(`✅ Connected to Nacos v${health.version} (standalone: ${health.standalone})`);
  console.log("\n📦 Publishing & Synchronizing Modular Configs...");

  const result = await syncAllConfigsToNacos();
  for (const pub of result.published) {
    console.log(`   ✔ Published DataID: ${pub} [DEFAULT_GROUP]`);
  }

  if (result.errors.length > 0) {
    console.error("\n❌ Errors encountered:");
    for (const err of result.errors) {
      console.error(`   ✖ ${err}`);
    }
  } else {
    console.log("\n🎉 All 4 modular configs synced successfully!");
  }

  console.log("\n📋 Current Nacos Config Registry:");
  const configs = await listNacosConfigs();
  for (const c of configs) {
    console.log(`   • ${c.dataId} (${c.type}) in group ${c.group}`);
  }

  console.log("\n🔍 Verification of Parsed Configs:");
  const storage = await getNacosParsedConfig("khlan-storage.yaml");
  console.log("   • khlan-storage.yaml default-provider:", (storage as any)?.storage?.["default-provider"]);

  const tg = await getNacosParsedConfig("khlan-telegram.yaml");
  console.log("   • khlan-telegram.yaml bot-token exists:", Boolean((tg as any)?.telegram?.["bot-token"]));

  const fe = await getNacosParsedConfig("khlan-frontend.yaml");
  console.log("   • khlan-frontend.yaml app-name:", (fe as any)?.frontend?.["app-name"]);

  console.log("\n✨ Sync complete! Spring Boot and Next.js are ready to hot-reload from Nacos.");
}

main().catch((err) => {
  console.error("Fatal error running nacos-sync:", err);
  process.exit(1);
});
