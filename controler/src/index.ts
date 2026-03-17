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

const PALETTES = [
  { name: "Valkyrie", main: "yellow", accent: "cyan" },
  { name: "Emerald", main: "green", accent: "white" },
  { name: "Cobalt", main: "blue", accent: "cyan" },
];

const latencyHistory = { x: ["00:00:00"], y: [0] };

const header = grid.set(0, 0, 2, 12, blessed.box, {
  tags: true,
  border: "line",
  style: { fg: "cyan", bold: true, border: { fg: "#44475a" } },
});

const healthBox = grid.set(2, 0, 4, 4, blessed.box, {
  label: " [ SYSTEM ] ",
  tags: true,
  border: "line",
  padding: { left: 1 },
  style: { border: { fg: "yellow" }, fg: "white" },
});

const line = grid.set(2, 4, 4, 8, contrib.line, {
  label: " [ NETWORK_LATENCY ] ",
  showLegend: false,
  border: "line",
  style: { text: "white", baseline: "black" },
});

const table = grid.set(6, 0, 4, 9, contrib.table, {
  keys: true,
  label: " [ NODES ] ",
  border: "line",
  columnSpacing: 2,
  columnWidth: [18, 10, 10, 12],
  fg: "white",
  selectedFg: "black",
  selectedBg: "yellow",
  style: {
    border: { fg: "#44475a" },
    header: { fg: "cyan", bold: true },
    cell: { fg: "white" },
  },
});

const gauge = grid.set(6, 9, 4, 3, contrib.gauge, {
  label: " [ LOAD ] ",
  border: "line",
  stroke: "cyan",
  fill: "black",
});

const log = grid.set(10, 0, 2, 12, contrib.log, {
  label: " [ KERNEL_LOG ] ",
  tags: true,
  border: "line",
  style: { fg: "white", border: { fg: "#44475a" } },
});

let pubClient = null;

function updateHeader() {
  const statusStr = isRunning ? "{green-fg}ACTIVE{/}" : "{red-fg}STANDBY{/}";
  header.setContent(
    `VALKYRIE C2 ORCHESTRATOR | ARCH: X64 | AUTH: PHANTEKZY\n` +
      `TARGET: ${config.targetUrl} | STATUS: [ ${statusStr} ]`,
  );
}

function broadcast(type) {
  if (pubClient) {
    pubClient.publish(
      REDIS_KEYS.COMMAND_CHANNEL,
      JSON.stringify({ type, config }),
    );
    log.log(`{cyan-fg}[ACTION]{/} ${type} signal broadcasted.`);
  }
}

function confirmAction(type) {
  const question = blessed.question({
    parent: screen,
    top: "center",
    left: "center",
    width: "40%",
    height: "shrink",
    border: "line",
    label: " [ CONFIRM ] ",
    style: { border: { fg: "yellow" }, bg: "black" },
    keys: true,
  });

  const msg =
    type === "START" ? "Engage all mesh nodes?" : "Kill all active sessions?";
  question.ask(msg, (err, value) => {
    if (value) {
      isRunning = type === "START";
      broadcast(type);
      updateHeader();
      screen.render();
    }
  });
}

function openConfigModal(title, current, cb) {
  const form = blessed.form({
    parent: screen,
    top: "center",
    left: "center",
    width: 50,
    height: 8,
    border: "line",
    label: ` [ ${title} ] `,
    style: { border: { fg: "cyan" }, bg: "black" },
    keys: true,
  });

  const input = blessed.textbox({
    parent: form,
    top: 2,
    left: 2,
    right: 2,
    height: 3,
    border: "line",
    inputOnFocus: true,
    value: current,
    style: { border: { fg: "white" }, focus: { border: { fg: "cyan" } } },
  });

  input.focus();
  input.on("submit", (v) => {
    cb(v);
    updateHeader();
    broadcast("UPDATE");
    form.destroy();
    screen.render();
  });
  screen.render();
}

function cycleTheme() {
  paletteIdx = (paletteIdx + 1) % PALETTES.length;
  const p = PALETTES[paletteIdx];

  [header, healthBox, table, gauge, log].forEach((c) => {
    if (c.style && c.style.border) c.style.border.fg = p.main;
  });

  table.selectedBg = p.main;
  table.style.header.fg = p.accent;

  gauge.style.stroke = p.accent;
  actionBar.style.selected.bg = p.main;

  log.log(`{yellow-fg}[SYSTEM]{/} Applied palette: ${p.name}`);
  screen.render();
}

const actionBar = blessed.listbar({
  parent: screen,
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  keys: true,
  style: {
    bg: "black",
    item: { fg: "white" },
    selected: { bg: "yellow", fg: "black", bold: true },
  },
  commands: {
    START: { keys: ["s"], callback: () => confirmAction("START") },
    STOP: { keys: ["x"], callback: () => confirmAction("STOP") },
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

    line.setData([
      {
        title: "P99 Latency",
        x: [...latencyHistory.x],
        y: [...latencyHistory.y],
        style: { line: PALETTES[paletteIdx].main },
      },
    ]);
    rawLatencies = [];
  }

  const total = statuses["2xx"] + statuses["5xx"];
  healthBox.setContent(
    `UPTIME   : ${Math.floor((Date.now() - startTime) / 1000)}s\n` +
      `C2_LINK  : ${isRunning ? "{green-fg}ONLINE{/}" : "{red-fg}STANDBY{/}"}\n` +
      `HEALTH   : ${total > 0 ? ((statuses["2xx"] / total) * 100).toFixed(2) : "100.00"}%\n` +
      `AGGR     : x${config.aggressivity}\n` +
      `TX_TOTAL : ${totalProcessed}`,
  );

  table.setData({
    headers: ["NODE", "RPS", "ERR", "STATE"],
    data: [
      [
        "valkyrie-alpha",
        `${reqCount}`,
        `${statuses["5xx"]}`,
        isRunning ? "RUN" : "IDLE",
      ],
      ["cluster-mesh", `${totalProcessed}`, "0", "UP"],
    ],
  });
}

async function boot() {
  const redis = createClient({ url: "redis://127.0.0.1:6379" });
  pubClient = redis.duplicate();
  await Promise.all([redis.connect(), pubClient.connect()]);
  log.log(`{green-fg}[BOOT]{/} Orchestrator ready.`);
  updateHeader();
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
    }
  }
}

setInterval(() => {
  const load = isRunning
    ? Math.min(100, (reqCount / (10 * config.aggressivity)) * 100)
    : 0;
  gauge.setPercent(load);
  updateAnalytics();
  updateHeader();
  reqCount = 0;
  screen.render();
}, 1000);

boot().catch(console.error);
