#!/usr/bin/env node

/**
 * 翻译完整性检查脚本
 * 验证 zh-CN 和 en-US 翻译字典的 key 是否一致
 */

const fs = require("fs");
const path = require("path");

const zhCNPath = path.join(__dirname, "../src/lib/i18n/translations/zh-CN.json");
const enUSPath = path.join(__dirname, "../src/lib/i18n/translations/en-US.json");

try {
  const zhCN = JSON.parse(fs.readFileSync(zhCNPath, "utf-8"));
  const enUS = JSON.parse(fs.readFileSync(enUSPath, "utf-8"));

  const zhKeys = Object.keys(zhCN).sort();
  const enKeys = Object.keys(enUS).sort();

  const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));
  const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));

  let hasErrors = false;

  if (missingInEn.length > 0) {
    console.error("❌ Missing in en-US.json:");
    missingInEn.forEach((k) => console.error(`   - ${k}`));
    hasErrors = true;
  }

  if (missingInZh.length > 0) {
    console.error("❌ Missing in zh-CN.json:");
    missingInZh.forEach((k) => console.error(`   - ${k}`));
    hasErrors = true;
  }

  if (!hasErrors) {
    console.log("✅ All translation keys present in both languages");
    console.log(`   Total keys: ${zhKeys.length}`);
  } else {
    process.exit(1);
  }
} catch (err) {
  console.error("❌ Error reading translation files:", err.message);
  process.exit(1);
}
