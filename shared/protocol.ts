export const REDIS_KEYS = {
  COMMAND_CHANNEL: "valkyrie:commands",
  TELEMETRY_STREAM: "valkyrie:telemetry",
  GROUPE_NAME: "valkyrie_processors",
};

export interface AttackConfig {
  targetUrl: string;
  concurrency: number;
  duration: number;
  method: "GET" | "POST";
}
