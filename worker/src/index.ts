import { createClient } from "redis";
import { LoadEngine } from "./engine.js";
import { REDIS_KEYS, AttackConfig } from "../../shared/protocol.js";

const nodeId = `node-${Math.random().toString(36).slice(2, 6)}`;
const redis = createClient({ url: "redis://127.0.0.1:6379" });
const pub = redis.duplicate();

await Promise.all([redis.connect(), pub.connect()]);

const engine = new LoadEngine(nodeId, async (ev) => {
  await pub.xAdd(REDIS_KEYS.TELEMETRY_STREAM, "*", {
    nodeId: ev.nodeId,
    status: ev.status.toString(),
    latency: ev.latency.toString(),
    ts: ev.ts.toString(),
  });
});

redis.subscribe(REDIS_KEYS.COMMAND_CHANNEL, (msg) => {
  const data = JSON.parse(msg);
  if (data.type === "START") {
    engine.start(data.config as AttackConfig);
  } else if (data.type === "STOP") {
    engine.stop();
  }
});

console.log(`[SYSTEM] Worker ${nodeId} online.`);
