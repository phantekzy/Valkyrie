# Valkyrie | Distributed Load Orchestration System

Valkyrie is a high-velocity, asynchronous traffic orchestration framework designed to simulate extreme system stress in distributed environments. By utilizing a decoupled Controller-Worker architecture, the system provides real-time telemetry and sub-millisecond analytics without compromising the integrity of the execution lanes.

## System Architecture

The system operates on a State-Synchronized model orchestrated via a high-throughput Redis message bus.

1.  **Command & Control (Controller):** A centralized TUI dashboard built on the Blessed-contrib engine. It broadcasts operational signals (START, UPDATE, STOP) and aggregates telemetry batches into visual performance metrics.
2.  **Orchestration (Broker):** Managed by Redis, the system utilizes Pub/Sub for low-latency command propagation and Redis Streams for persistent telemetry buffering and consumer group management.
3.  **Execution (Worker):** Stateless, horizontally scalable agents that monitor the command channel. Workers spawn asynchronous HTTP "lanes" with isolated reporting logic to ensure maximum target saturation.

---

## Technical Specifications

### Performance Analytics & Telemetry
* **P99 Tail-Latency:** Real-time calculation via a rolling-window sorting algorithm, identifying the 99th percentile to expose worst-case performance outliers.
* **Throughput (RPS):** Atomic request tracking across the entire cluster, providing real-time data on successful vs. failed interactions.
* **Dynamic Intensity:** Real-time hot-swapping of concurrency settings via the controller, allowing for immediate scaling of load without process termination.

### Full-Stack Integrity
The system maintains a unified TypeScript protocol layer. The 'AttackConfig' and 'TelemetryEvent' contracts are strictly enforced between the C2 Dashboard and the distributed Workers, ensuring structural integrity across the Redis wire.

## Tech Stack

* **Runtime:** Node.js (ESM)
* **Infrastructure:** Redis (Orchestrated via Podman)
* **TUI Layer:** Blessed / Blessed-contrib
* **Language:** TypeScript
* **HTTP Engine:** Axios (Custom Keep-Alive)

---

## Environment Configuration

Configuration is driven strictly via environment variables to ensure zero-leak security. Hardcoded IP addresses and internal endpoints are prohibited.

### Global Configuration
- **VALKYRIE_REDIS_URL**: The full connection string for the Redis broker.
- **VALKYRIE_TARGET_URL**: The designated endpoint for load generation operations.

---

## Deployment & Development

### 1. Initialize Infrastructure (Podman)
podman run -d --name valkyrie-broker -p 6379:6379 redis:alpine

### 2. Ignition
# Launch Controller
cd controller && npx tsx src/index.ts

# Launch Workers
cd worker && npx tsx src/index.ts

---

## Command Reference
The TUI provides granular control over the cluster lifecycle:
* [S] - Initialize cluster-wide attack sequence.
* [UP/DOWN] - Dynamically adjust concurrency (+/- 10).
* [Q] - Immediate graceful shutdown and state cleanup.

---

## Author
Maini Lotfi Abdelkader (phantekzy)
Systems Engineer & Full Stack Developer
Algiers, Algeria
