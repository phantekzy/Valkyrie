import axios, { AxiosInstance } from "axios";
import { AttackConfig, TelemetryEvent } from "../../shared/protocol.js";

export class LoadEngine {
  private active = false;
  private http: AxiosInstance;

  constructor(
    private nodeId: string,
    private onReport: (data: TelemetryEvent) => Promise<void>,
  ) {
    this.http = axios.create({
      timeout: 5000,
      validateStatus: () => true,
    });
  }

  async start(config: AttackConfig) {
    this.active = true;
    const end = Date.now() + config.duration * 1000;
    const lanes = Array.from({ length: config.concurrency }).map(async () => {
      while (this.active && Date.now() < end) {
        const start = performance.now();
        try {
        } catch (err) {
          await this.onReport({
            nodeId: this.nodeId,
            status: 504,
            latency: 5000,
            ts: Date.now(),
          });
        }
      }
    });
  }
}
