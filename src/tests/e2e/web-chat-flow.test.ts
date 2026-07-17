import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";

const NEW_SESSION_RE = /新建会话/;
const SEND_RE = /发送/;

let electronApp: ElectronApplication;

test.beforeAll(async () => {
  const envPath = join(process.cwd(), ".env.dev");
  if (!existsSync(envPath)) {
    console.warn("web-chat-flow: .env.dev not found, skipping");
    return;
  }
  const content = readFileSync(envPath, "utf-8");
  if (!content.includes("ACP_SERVER_PI_COMMAND")) {
    console.warn("web-chat-flow: ACP server not configured, skipping");
    return;
  }

  const latestBuild = findLatestBuild();
  const appInfo = parseElectronApp(latestBuild);
  process.env.CI = "e2e";
  electronApp = await electron.launch({ args: [appInfo.main] });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test("web chat: send message and persist reply", async () => {
  if (!electronApp) {
    test.skip();
    return;
  }
  test.setTimeout(60_000);

  const page: Page = await electronApp.firstWindow();

  await page.waitForSelector("text=新建会话");

  await page.getByRole("button", { name: NEW_SESSION_RE }).click();

  const textarea = page.locator("textarea").first();
  await textarea.waitFor({ state: "visible" });
  await textarea.fill("hello from e2e");

  await page.getByRole("button", { name: SEND_RE }).click();

  const assistantBubble = page.locator(".is-assistant").first();
  await expect(assistantBubble).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    const text = await assistantBubble.textContent();
    expect(text?.trim().length ?? 0).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });
});
