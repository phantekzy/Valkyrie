import { createClient } from "redis";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { REDIS_KEYS } from "../../shared/protocol.js";

const screen = blessed.screen({
  smartCSR: true,
  title: "VALKYRIE CONTROL | DISTRIBUTED ORCHESTRATOR",
  fullUnicode: true,
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen });

let config = {
  targetUrl: "http://localhost:3000",
  concurrency: 50,
  aggressivity: 5,
};
let reqCount = 0;
let totalProcessed = 0;
let isRunning = false;
let paletteIdx = 0;
let rawLatencies = [];
const statuses = { "2xx": 0, "5xx": 0 };
const startTime = Date.now();

const latencyHistory = {
  title: "P99 Latency",
  x: ["00:00:00"],
  y: [0],
  style: { line: "yellow" },
};

const PALETTES = [
  { name: "Valkyrie", main: "yellow", accent: "cyan" },
  { name: "Emerald", main: "green", accent: "white" },
  { name: "Cobalt", main: "blue", accent: "cyan" },
];

const line = grid.set(0, 0, 4, 8, contrib.line, {
  label: " [ NETWORK_PERFORMANCE ] ",
  showLegend: false,
  style: { line: "yellow", text: "white", baseline: "black" },
});

const healthBox = grid.set(0, 8, 4, 4, blessed.box, {
  label: " [ SYSTEM_MANIFEST ] ",
  tags: true,
  padding: { left: 1, top: 1 },
  style: { border: { fg: "yellow" } },
});

const table = grid.set(4, 0, 4, 9, contrib.table, {
  keys: true,
  label: " [ ACTIVE_WORKER_NODES ] ",
  columnSpacing: 4,
  columnWidth: [18, 10, 10, 12],
});

const gauge = grid.set(4, 9, 4, 3, contrib.gauge, {
  label: " [ LOAD ] ",
  stroke: "cyan",
  fill: "white",
});

const log = grid.set(8, 0, 3, 12, contrib.log, {
  label: " [ ORCHESTRATOR_LOGS ] ",
  tags: true,
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
          (v) => (config.targetUrl = v),
        ),
    },
    AGGRO: {
      keys: ["a"],
      callback: () =>
        openConfigModal(
          "AGRESSIVITY",
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
  height: 8,
  border: "line",
  hidden: true,
  keys: true,
  style: { border: { fg: "cyan" }, bg: "black" },
});

const formInput = blessed.textbox({
  parent: form,
  top: 2,
  left: 2,
  right: 2,
  height: 3,
  border: "line",
  inputOnFocus: true,
  style: { border: { fg: "white" }, focus: { border: { fg: "yellow" } } },
});

let pubClient = null;

function broadcast(type) {
  if (pubClient) {
    pubClient.publish(
      REDIS_KEYS.COMMAND_CHANNEL,
      JSON.stringify({ type, config }),
    );
    log.log(`{cyan-fg}[ACTION]{/} ${type} signal broadcasted.`);
  }
}

function openConfigModal(title, current, cb) {
  form.setLabel(` [ ${title} ] `);
  formInput.setValue(current);
  form.show();
  formInput.focus();
  formInput.once("submit", (v) => {
    cb(v);
    broadcast("UPDATE");
    form.hide();
    screen.render();
  });
  screen.render();
}

function cycleTheme() {
  paletteIdx = (paletteIdx + 1) % PALETTES.length;
  const p = PALETTES[paletteIdx];

  const components = [line, healthBox, table, gauge, log, form];
  components.forEach((c) => {
    if (c.style && c.style.border) c.style.border.fg = p.main;
  });

  line.style.line = p.main;
  gauge.style.stroke = p.accent;
  actionBar.style.selected.bg = p.main;
  log.log(`{yellow-fg}[SYSTEM]{/} Applied palette: ${p.name}`);
  screen.render();
}

function updateAnalytics() {
  if (rawLatencies.length > 0) {
    const sorted = [...rawLatencies].sort((a, b) => a - b);
    const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1] || 0;
    latencyHistory.y.push(p99);
    latencyHistory.x.push(new Date().toLocaleTimeString().slice(-5));
    if (latencyHistory.y.length > 20) {
      latencyHistory.y.shift();
      latencyHistory.x.shift();
    }
    line.setData([latencyHistory]);
    rawLatencies = [];
  }

  const total = statuses["2xx"] + statuses["5xx"];
  const successRate =
    total > 0 ? ((statuses["2xx"] / total) * 100).toFixed(2) : "100.00";

  healthBox.setContent(
    `{bold}STATUS:{/bold} ${isRunning ? "{green-fg}ACTIVE{/}" : "{red-fg}HALTED{/}"}\n` +
      `{bold}HEALTH:{/bold} ${successRate}%\n` +
      `{bold}UPTIME:{/bold} ${Math.floor((Date.now() - startTime) / 1000)}s\n` +
      `{bold}AGGRO: {/bold} LVL_${config.aggressivity}\n` +
      `{bold}TOTAL: {/bold} ${totalProcessed}`,
  );

  table.setData({
    headers: ["NODE_ID", "RPS", "ERR", "STATE"],
    data: [
      [
        "valkyrie-alpha",
        `${reqCount}`,
        `${statuses["5xx"]}`,
        isRunning ? "RUN" : "IDLE",
      ],
      ["cluster-mesh", `${totalProcessed}`, "--", "UP"],
    ],
  });
}

async function boot() {
  const redis = createClient({ url: "redis://127.0.0.1:6379" });
  pubClient = redis.duplicate();
  await Promise.all([redis.connect(), pubClient.connect()]);

  log.log(`{green-fg}[BOOT]{/} Orchestrator ready. Waiting for START signal.`);
  screen.render();

  while (true) {
    const data = await redis.xReadGroup(
      REDIS_KEYS.GROUP_NAME,
      "c1",
      [{ key: REDIS_KEYS.TELEMETRY_STREAM, id: ">" }],
      { COUNT: 1000, BLOCK: 100 },
    );

    if (data && isRunning) {
      const msgs = data[0].messages;
      msgs.forEach((m) => {
        reqCount++;
        totalProcessed++;
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
      if (msgs.length > 50)
        log.log(
          `{white-fg}[MESH]{/} High-volume burst: ${msgs.length} frames.`,
        );
    }
  }
}

setInterval(() => {
  const load = isRunning
    ? Math.min(100, (reqCount / (10 * config.aggressivity)) * 100)
    : 0;
  gauge.setPercent(load);
  updateAnalytics();
  reqCount = 0;
  screen.render();
}, 1000);

boot().catch(console.error);
