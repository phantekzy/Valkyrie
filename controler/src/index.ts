import { createClient } from "redis";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { REDIS_KEYS } from "../../shared/protocol.js";

const redis = createClient({ url: "redis://127.0.0.1:6379" });
const pub = redis.duplicate();
await Promise.all([redis.connect(), pub.connect()]);

const screen = blessed.screen();
const grid = new contrib.grid({ rows: 12, cols: 12, screen });
const line = grid.set(0, 0, 8, 12, contrib.line, {
  label: " Cluster Latency P99 (ms) ",
  style: { line: "yellow" },
});
const log = grid.set(8, 0, 4, 12, contrib.log, { label: " Telemetry " });

const chartData = { title: "P99", x: [] as string[], y: [] as number[] };
let rawLatencies: number[] = [];

async function main() {
  try {
    await redis.xGroupCreate(
      REDIS_KEYS.TELEMETRY_STREAM,
      REDIS_KEYS.GROUP_NAME,
      "0",
      { MKSTREAM: true },
    );
  } catch (e: any) {
    if (!e.message.includes("BUSYGROUP")) {
      console.error("Actual Redis Error:", e);
      process.exit(1);
    }
  }
  while (true) {
    const data = await redis.xReadGroup(
      REDIS_KEYS.GROUP_NAME,
      "c-main",
      { key: REDIS_KEYS.TELEMETRY_STREAM, id: ">" },
      { COUNT: 50, BLOCK: 100 },
    );
    if (data) {
      data[0].messages.forEach((m) => {
        const lat = parseFloat(m.data.latency);
        rawLatencies.push(lat);
        if (rawLatencies.length > 500) rawLatencies.shift();

        const sorted = [...rawLatencies].sort((a, b) => a - b);
        const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1];
      });
    }
  }
}
