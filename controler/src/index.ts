import { createClient } from "redis";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { REDIS_KEYS } from "../../shared/protocol.js";

const screen = blessed.screen({ smartCSR: true, title: "Valkyrie C2" });
const grid = new contrib.grid({ rows: 12, cols: 12, screen });

const line = grid.set(0, 0, 8, 12, contrib.line, {
  label: " Cluster Latency P99 (ms) ",
  showLegend: true,
  style: { line: "yellow", text: "green", baseline: "black" },
});

const log = grid.set(8, 0, 4, 12, contrib.log, {
  label: " System & Telemetry Logs ",
  border: { type: "line", fg: "cyan" },
});

screen.key(["q", "C-c"], () => process.exit(0));
log.log("[SYSTEM] Booting Controller...");
screen.render();

const chartData = { title: "P99", x: [] as string[], y: [] as number[] };
let rawLatencies: number[] = [];

async function boot() {
  const redis = createClient({ url: "redis://127.0.0.1:6379" });
  const pub = redis.duplicate();

  try {
    await Promise.all([redis.connect(), pub.connect()]);
    log.log("[SYSTEM] Connected to Broker.");
    screen.render();
  } catch (err: any) {
    log.log(`[FATAL] Redis Error: ${err.message}`);
    screen.render();
    return;
  }

  screen.key(["s"], () => {
    log.log("[COMMAND] Sending START signal...");
    const cmd = {
      type: "START",
      config: {
        targetUrl: "http://localhost:3000",
        concurrency: 10,
        duration: 60,
        method: "GET",
      },
    };
    pub.publish(REDIS_KEYS.COMMAND_CHANNEL, JSON.stringify(cmd));
    screen.render();
  });

  try {
    await redis.xGroupCreate(
      REDIS_KEYS.TELEMETRY_STREAM,
      REDIS_KEYS.GROUP_NAME,
      "0",
      { MKSTREAM: true },
    );
  } catch (e) {}

  while (true) {
    try {
      const data = await redis.xReadGroup(
        REDIS_KEYS.GROUP_NAME,
        "c-main",
        { key: REDIS_KEYS.TELEMETRY_STREAM, id: ">" },
        { COUNT: 50, BLOCK: 100 },
      );

      if (data) {
        data[0].messages.forEach((m) => {
          const payload = m.message;
          const lat = parseFloat(payload.latency);

          if (isNaN(lat)) return;

          rawLatencies.push(lat);
          if (rawLatencies.length > 500) rawLatencies.shift();

          const sorted = [...rawLatencies].sort((a, b) => a - b);
          const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1] || 0;

          chartData.y.push(p99);
          chartData.x.push(
            new Date(parseInt(payload.ts)).toLocaleTimeString().slice(-5),
          );

          if (chartData.y.length > 20) {
            chartData.y.shift();
            chartData.x.shift();
          }

          log.log(
            `[${payload.nodeId}] Lat: ${lat.toFixed(0)}ms | P99: ${p99.toFixed(0)}ms`,
          );
        });
        line.setData([chartData]);
        screen.render();
      }
    } catch (err: any) {
      log.log(`[LOOP ERROR] ${err.message}`);
      screen.render();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

boot();
