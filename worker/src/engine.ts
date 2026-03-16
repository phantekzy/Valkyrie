import { AxiosInstance } from "axios";
import { TelemetryEvent } from "../../shared/protocol";
import axios from "axios";

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
}
