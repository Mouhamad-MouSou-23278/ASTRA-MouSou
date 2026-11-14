// End-to-end browser smoke test for ASTRA (drives the real UI in an installed browser).
//
//   1. start the backend with the built frontend:   scripts/start.ps1
//   2. from frontend/:                               node e2e/smoke.mjs [baseUrl] [screenshotDir]
//
// Uses playwright-core with the locally installed Chrome or Edge (no browser download).
// Exits non-zero if any step fails or the page logs an error.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:8000";
const SHOTS = process.argv[3] ?? "e2e-screenshots";
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const log = (...a) => console.log(...a);
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function launch() {
  const args = ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"];
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true, args });
    } catch { /* try the next installed browser */ }
  }
  throw new Error("Neither Chrome nor Edge could be launched");
}

function watch(page, tag) {
  page.on("pageerror", (e) => problems.push(`[${tag}] page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|401|403/.test(m.text())) problems.push(`[${tag}] console: ${m.text()}`);
  });
}

async function login(page, role) {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const clockSeconds = async (page) => {
  const text = await page.locator(".hud .clock").innerText();
  const m = /T\+(\d+):(\d+)/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
const waitClock = async (page, seconds) => {
  for (let i = 0; i < 400; i++) {
    if ((await clockSeconds(page)) >= seconds) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`simulation never reached T+${seconds}s`);
};

const browser = await launch();
try {
  // ---------------------------------------------------------------- operator
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  watch(page, "operator");
  await login(page, "Test Operator");
  await page.waitForSelector("text=1 · Describe the test");
  await page.waitForFunction(() => document.querySelector("textarea")?.value.includes("Simulate an astronaut"));
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.waitForSelector("text=2 · Review the plan");
  await page.waitForSelector("svg.map");
  await shot(page, "01-plan-preview");
  const steps = await page.locator(".step").count();
  log(`plan preview: ${steps} steps listed`);
  if (steps < 9) problems.push(`expected at least 9 plan steps, saw ${steps}`);

  await page.getByRole("button", { name: /Confirm plan/ }).click();
  await page.waitForURL(/\/operator\/session\//);
  const sessionUrl = page.url();
  await page.waitForSelector(".scene canvas");
  await page.waitForFunction(() => !document.querySelector(".scene-msg"), null, { timeout: 60000 });
  const gl = await page.evaluate(() => {
    const c = document.querySelector(".scene canvas");
    return { w: c.width, h: c.height };
  });
  log(`3D scene ready, canvas ${gl.w}x${gl.h}`);
  await shot(page, "02-session-planned");

  await page.locator(".controls select").selectOption("8");
  await page.getByRole("button", { name: /Start/ }).click();
  await waitClock(page, 60);
  await shot(page, "03-walk-third-person");

  await page.getByRole("button", { name: "Overview" }).click();
  await waitClock(page, 150);
  await shot(page, "04-overview");

  await page.getByRole("button", { name: "1st person" }).click();
  await waitClock(page, 200);
  await shot(page, "05-first-person");

  await page.getByRole("button", { name: "Close-up" }).click();
  await waitClock(page, 255);
  await page.locator(".controls select").selectOption("1");
  await page.waitForTimeout(1500);
  await shot(page, "06-closeup-collect");
  await page.locator(".controls select").selectOption("8");
  await waitClock(page, 292);
  await page.getByRole("button", { name: /Pause/ }).click();
  await page.waitForSelector(".chip.paused");

  const medical = await page.locator(".warn-card:not(.dq) h4").allInnerTexts();
  log("active medical warnings:", JSON.stringify(medical));
  if (!medical.some((m) => /Heat strain/.test(m))) problems.push("heat strain warning is not shown at T+292");
  const dq = await page.locator(".warn-card.dq").count();
  if (dq !== 0) problems.push(`unexpected data-quality warnings in a healthy run: ${dq}`);

  await page.getByRole("button", { name: "Why is my body temperature increasing?" }).click();
  await page.waitForSelector(".msg.assistant .meta");
  const reply = await page.locator(".msg.assistant").last().innerText();
  log("ASTRA:", reply.replace(/\s+/g, " ").slice(0, 420));
  for (const needle of ["thermal stress event", "independent"]) {
    if (!reply.includes(needle)) problems.push(`ASTRA reply is missing "${needle}"`);
  }
  await page.getByRole("button", { name: "3rd person" }).click();
  await page.waitForTimeout(1200);
  await shot(page, "07-warning-and-astra");

  // ---------------------------------------------------------- QR viewer link
  await page.getByRole("button", { name: /Viewer QR/ }).click();
  await page.getByRole("button", { name: "Generate QR code" }).click();
  await page.waitForSelector(".qr svg");
  const viewerUrl = await page.locator(".modal code").first().innerText();
  log("viewer url:", viewerUrl.replace(/\/view\/.+$/, "/view/<token>"));
  await shot(page, "08-qr-modal");
  await page.keyboard.press("Escape");

  const phone = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const viewer = await phone.newPage();
  watch(viewer, "viewer");
  const token = viewerUrl.split("/view/")[1];
  await viewer.goto(`${BASE}/view/${token}`);
  await viewer.waitForSelector(".scene canvas");
  await viewer.waitForFunction(() => !document.querySelector(".scene-msg"), null, { timeout: 60000 });
  await viewer.waitForTimeout(4000);
  if (await viewer.locator(".controls").count()) problems.push("viewer page shows playback controls");
  if (!(await viewer.locator("text=INSTRUMENT VIEWER").count())) problems.push("viewer header missing");
  await shot(viewer, "09-viewer-phone");
  await viewer.getByRole("tab", { name: "Telemetry" }).click();
  await viewer.waitForTimeout(600);
  await viewer.screenshot({ path: join(SHOTS, "10-viewer-phone-telemetry.png"), fullPage: true });
  // A viewer token must not open the staff API.
  const staff = await viewer.evaluate(async (t) => (await fetch("/api/sensors", { headers: { "X-Viewer-Token": t } })).status, token);
  if (staff !== 401) problems.push(`viewer token reached /api/sensors (HTTP ${staff})`);
  await phone.close();

  await page.getByRole("button", { name: /Resume/ }).click();
  await page.locator(".chip.completed").waitFor({ timeout: 60000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "11-completed-full.png"), fullPage: true });
  log("session completed:", sessionUrl.split("/").pop());

  // ------------------------------------------- sensor fault drill (data quality)
  await page.goto(`${BASE}/operator`);
  await page.waitForSelector("text=1 · Describe the test");
  await page.locator("select").first().selectOption({ label: "Sensor fault drill" });
  await page.getByRole("button", { name: "Generate plan" }).click();
  await page.waitForSelector("text=2 · Review the plan");
  await page.waitForSelector("text=SENSOR FAULT INJECTION");
  await page.getByRole("button", { name: /Confirm plan/ }).click();
  await page.waitForURL(/\/operator\/session\//);
  await page.waitForFunction(() => !document.querySelector(".scene-msg"), null, { timeout: 60000 });
  await page.locator(".controls select").selectOption("16");
  await page.getByRole("button", { name: /Start/ }).click();
  await waitClock(page, 112);
  await page.locator(".controls select").selectOption("1");
  await page.locator(".warn-card.dq").first().waitFor({ timeout: 20000 });
  const dqCards = await page.locator(".warn-card.dq").allInnerTexts();
  const medicalDuringFault = await page.locator(".warn-card:not(.dq)").count();
  log("data quality warnings:", JSON.stringify(dqCards.map((t) => t.replace(/\s+/g, " ").slice(0, 90))));
  if (!dqCards.some((t) => /disconnected|no data/i.test(t))) problems.push("disconnect fault did not raise a data-quality warning");
  if (medicalDuringFault !== 0) problems.push(`a sensor fault produced ${medicalDuringFault} medical warning(s)`);
  await page.getByRole("button", { name: "Is the sensor data reliable?" }).click();
  await page.waitForSelector(".msg.assistant .meta");
  const dqReply = await page.locator(".msg.assistant").last().innerText();
  if (!/sensor problems, not medical findings/.test(dqReply)) problems.push("ASTRA did not separate data quality from medical findings");
  await shot(page, "16-fault-drill-data-quality");
  await page.getByRole("button", { name: /Stop/ }).click();
  await page.locator(".chip.stopped").waitFor();
  await ctx.close();

  // -------------------------------------------------------------- other roles
  for (const [role, checks] of [
    ["Physical Team", [["Sensor registry", "12-physical-sensors"]]],
    ["Medical Team", [["Medical conditions", "13-medical-conditions"]]],
    ["Admin", [["Simulation safety", "14-admin-overview"]]],
    ["Instrument Viewer", [["Simulation sessions", "15-viewer-role-sessions"]]],
  ]) {
    const c = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const p = await c.newPage();
    watch(p, role);
    await login(p, role);
    for (const [text, name] of checks) {
      await p.waitForSelector(`text=${text}`);
      await p.waitForTimeout(700);
      await shot(p, name);
    }
    if (role === "Medical Team") {
      await p.getByRole("tab", { name: "Warning rules" }).click();
      await p.waitForSelector("text=Multi-sensor warning rules");
      await p.waitForTimeout(500);
      await shot(p, "13b-medical-rules");
      // The Medical Team sees sensors read-only.
      await p.goto(`${BASE}/physical`);
      await p.waitForSelector("text=Sensor registry");
      if (await p.getByRole("button", { name: "+ New sensor" }).count()) problems.push("medical role can see the New sensor button");
    }
    if (role === "Instrument Viewer") {
      await p.goto(`${BASE}/operator`);
      await p.waitForURL(/\/sessions/);       // route guard sends a viewer away from the operator console
    }
    await c.close();
  }
} catch (e) {
  problems.push(`FAILED: ${e.message}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error("\nPROBLEMS:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("\nE2E smoke test passed.");
