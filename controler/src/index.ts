import { createClient } from "redis";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { REDIS_KEYS } from "../../shared/protocol.js";

const screen = blessed.screen({
  smartCSR: true,
  title: "VALKYRIE CONTROL | DISTRIBUTED ORCHESTRATOR",
  fullUnicode: true,
});

screen.enableMouse();
const grid = new contrib.grid({ rows: 12, cols: 12, screen });

let config = {
  targetUrl: "http://localhost:3000",
  concurrency: 50,
  aggressivity: 5,
};
let reqCount = 0;
let isRunning = false;
let paletteIdx = 0;
const rpsHistory = Array(60).fill(0);
let rawLatencies: number[] = [];
const statuses = { "2xx": 0, "5xx": 0 };
const latencyHistory = {
  title: "P99",
  x: [],
  y: [],
  style: { line: "yellow" },
};

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

const PALETTES = [
  { name: "Valkyrie", main: "yellow", accent: "cyan" },
  { name: "Emerald", main: "green", accent: "white" },
  { name: "Cobalt", main: "blue", accent: "cyan" },
  { name: "Amethyst", main: "magenta", accent: "white" },
];

const line = grid.set(0, 0, 6, 9, contrib.line, {
  label: " Tail Latency (P99 ms) ",
  showLegend: true,
  style: { line: "yellow", text: "white", baseline: "black" },
});

const bar = grid.set(0, 9, 6, 3, contrib.bar, {
  label: " Status Codes ",
  barWidth: 4,
});

const spark = grid.set(6, 0, 2, 12, contrib.sparkline, {
  label: " Throughput (RPS) ",
  style: { fg: "cyan" },
});

const log = grid.set(8, 0, 3, 12, contrib.log, {
  label: " System Events ",
  bufferLength: 100,
});

const actionBar = blessed.listbar({
  parent: screen,
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  mouse: true,
  keys: true,
  style: {
    bg: "black",
    item: { fg: "white" },
    selected: { bg: "yellow", fg: "black", bold: true },
  },
  commands: {
    START: {
      keys: ["s"],
      callback: () => {
        isRunning = true;
        broadcast("START");
      },
    },
    STOP: {
      keys: ["x"],
      callback: () => {
        isRunning = false;
        broadcast("STOP");
      },
    },
    TARGET: {
      keys: ["u"],
      callback: () =>
        openConfigModal(
          "TARGET URL",
          config.targetUrl,
          (v) => (config.targetUrl = String(v)),
        ),
    },
    AGGRO: {
      keys: ["a"],
      callback: () =>
        openConfigModal(
          "AGGRESSIVITY",
          String(config.aggressivity),
          (v) => (config.aggressivity = parseInt(v)),
        ),
    },
    THEME: { keys: ["c"], callback: () => cycleTheme() },
    QUIT: { keys: ["q"], callback: () => process.exit(0) },
  },
});

const form = blessed.form({
  parent: screen,
  top: "center",
  left: "center",
  width: 50,
  height: 10,
  border: "line",
  hidden: true,
  label: " Settings ",
  keys: true,
  style: { border: { fg: "cyan" }, bg: "black" },
});

const formLabel = blessed.text({ parent: form, top: 1, left: 2, content: "" });
const formInput = blessed.textbox({
  parent: form,
  top: 3,
  left: 2,
  right: 2,
  height: 3,
  border: "line",
  inputOnFocus: true,
  keys: true,
  style: { border: { fg: "white" }, focus: { border: { fg: "yellow" } } },
});

const okBtn = blessed.button({
  parent: form,
  bottom: 1,
  right: 12,
  width: 10,
  height: 1,
  content: " CONFIRM ",
  align: "center",
  mouse: true,
  keys: true,
  style: { bg: "#2e7d32", fg: "white", focus: { bg: "#4caf50", bold: true } },
});

const cancelBtn = blessed.button({
  parent: form,
  bottom: 1,
  right: 2,
  width: 10,
  height: 1,
  content: " CANCEL ",
  align: "center",
  mouse: true,
  keys: true,
  style: { bg: "#c62828", fg: "white", focus: { bg: "#f44336", bold: true } },
});

function cycleTheme() {
  paletteIdx = (paletteIdx + 1) % PALETTES.length;
  const p = PALETTES[paletteIdx];

  line.style.line = p.main;
  spark.style.fg = p.accent;
  actionBar.style.selected.bg = p.main;

  const widgets = [line, bar, spark, log, form];
  widgets.forEach((w) => {
    if (w.style && w.style.border) {
      w.style.border.fg = p.main;
    }
  });

  log.log(`${C.yellow}[THEME]${C.reset} Switched to ${p.name}`);
  screen.render();
}

let activeCallback: (val: string) => void = () => {};
let pubClient: any = null;

function openConfigModal(
  title: string,
  current: string,
  cb: (v: string) => void,
) {
  actionBar.detach();
  formLabel.setContent(`${C.yellow}${title}${C.reset}`);
  formInput.setValue(String(current));
  activeCallback = cb;
  form.show();
  formInput.focus();
  screen.render();
}

const closeConfigModal = () => {
  form.hide();
  screen.append(actionBar);
  actionBar.focus();
  screen.render();
};

okBtn.on("press", () => {
  activeCallback(String(formInput.getValue()));
  broadcast("UPDATE");
  closeConfigModal();
});

cancelBtn.on("press", closeConfigModal);

function broadcast(type: string) {
  if (pubClient) {
    pubClient.publish(
      REDIS_KEYS.COMMAND_CHANNEL,
      JSON.stringify({ type, config }),
    );
  }
  log.log(`${C.cyan}[ACTION]${C.reset} ${type} dispatched.`);
  screen.render();
}

function updateGraphs() {
  if (rawLatencies.length === 0) return;
  const sorted = [...rawLatencies].sort((a, b) => a - b);
  const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1] || 0;

  latencyHistory.y.push(p99);
  latencyHistory.x.push(new Date().toLocaleTimeString().slice(-5));

  if (latencyHistory.y.length > 30) {
    latencyHistory.y.shift();
    latencyHistory.x.shift();
  }

  line.setData([latencyHistory]);
  bar.setData({
    titles: ["2xx", "Err"],
    data: [statuses["2xx"], statuses["5xx"]],
  });
  if (rawLatencies.length > 2000) rawLatencies.splice(0, 1000);
}

async function boot() {
  const redis = createClient({ url: "redis://127.0.0.1:6379" });
  pubClient = redis.duplicate();
  await Promise.all([redis.connect(), pubClient.connect()]);

  log.log(
    `${C.green}${C.bold}[SYSTEM]${C.reset} Redis Connected. Orchestrator Ready.`,
  );
  screen.render();

  try {
    await redis.xGroupCreate(
      REDIS_KEYS.TELEMETRY_STREAM,
      REDIS_KEYS.GROUP_NAME,
      "0",
      { MKSTREAM: true },
    );
  } catch (e) {}

  while (true) {
    const data = await redis.xReadGroup(
      REDIS_KEYS.GROUP_NAME,
      "c1",
      [{ key: REDIS_KEYS.TELEMETRY_STREAM, id: ">" }],
      { COUNT: 1000, BLOCK: 100 },
    );
    if (data) {
      const msgs = data[0].messages;
      msgs.forEach((m) => {
        reqCount++;
        m.message.status.startsWith("2")
          ? statuses["2xx"]++
          : statuses["5xx"]++;
        rawLatencies.push(parseFloat(m.message.latency));
      });
      await redis.xAck(
        REDIS_KEYS.TELEMETRY_STREAM,
        REDIS_KEYS.GROUP_NAME,
        msgs.map((m) => m.id),
      );
      updateGraphs();
    }
  }
}

setInterval(() => {
  rpsHistory.push(isRunning ? reqCount : 0);
  if (rpsHistory.length > 60) rpsHistory.shift();

  spark.setData([], [rpsHistory]);

  reqCount = 0;
  screen.render();
}, 1000);

screen.key(["escape"], closeConfigModal);
boot().catch(console.error);
