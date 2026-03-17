import { createClient } from "redis";
import { LoadEngine } from "./engine.js";
import { REDIS_KEYS } from "../../shared/protocol.js";

const nodeId = `node-${Math.random().toString(36).slice(2, 6)}`;
const redis = createClient({ url: "redis://127.0.0.1:6379" });
const pub = redis.duplicate();
await Promise.all([redis.connect(), pub.connect()]);

const engine = new LoadEngine(nodeId, async (status, latency) => {
  await pub.xAdd(REDIS_KEYS.TELEMETRY_STREAM, "*", {
    nodeId,
    status: status.toString(),
    latency: latency.toString(),
    ts: Date.now().toString(),
  });
});

redis.subscribe(REDIS_KEYS.COMMAND_CHANNEL, (msg) => {
  const { type, config } = JSON.parse(msg);
  engine.stop();
  if (type === "START" || type === "UPDATE") {
    engine.start(config);
    console.log(`[${type}] Intensity: ${config.concurrency}`);
  }
});

console.log(`[SYSTEM PHANTEKZY] ${nodeId} is standing by...`);
