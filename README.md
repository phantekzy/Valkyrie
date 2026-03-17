# Valkyrie C2 | Distributed Orchestrator

A high-performance, terminal-based Command & Control (C2) dashboard designed for managing distributed load-testing clusters. Built with Node.js, Redis, and Blessed-Contrib, Valkyrie provides a real-time, low-latency interface for orchestrating worker nodes and monitoring telemetry.

---

## System Architecture

The orchestrator utilizes a Controller-Worker model, communicating over a Redis backbone for both command broadcasting and telemetry ingestion.

* **Command Channel**: Redis Pub/Sub for instantaneous node synchronization.
* **Telemetry Stream**: Redis Streams for high-throughput, persistent metric collection.
* **Analytics Engine**: Real-time P99 latency calculation and status code distribution.

---

## Features

### Real-Time Dashboard
* **Network Latency**: Integrated line graph tracking P99 millisecond spikes.
* **Node Topology**: Active table tracking RPS (Requests Per Second) and error rates per cluster.
* **Load Meter**: Dynamic gauge tracking system pressure based on aggressivity settings.
* **Kernel Log**: Synchronized event logging with ANSI color support and automated status reporting.

### Operations Control
* **Mesh Engagement**: Global START / STOP signals with integrated safety confirmation prompts.
* **Live Injection**: Update Target URLs and Aggressivity multipliers on-the-fly without restarting worker processes.
* **Theme Engine**: Professional color palettes (Valkyrie, Emerald, Cobalt) optimized for high-contrast terminal environments.

---

## Keybindings

| Key | Action | Description |
| :--- | :--- | :--- |
| **S** | **START** | Engage all mesh nodes and begin broadcasting. |
| **X** | **STOP** | Terminate all active worker sessions. |
| **U** | **TARGET** | Change the destination endpoint URL dynamically. |
| **A** | **AGGRO** | Adjust the aggressivity multiplier for load generation. |
| **C** | **THEME** | Cycle through UI color palettes for optimal visibility. |
| **Q** | **QUIT** | Terminate the orchestrator process. |

---

## Installation & Setup

1.  **Prerequisites**:
    * Node.js (v18 or higher)
    * Redis Server (Running on 127.0.0.1:6379)

2.  **Configuration**:
    Verify that `shared/protocol.js` contains the correct `REDIS_KEYS` for the telemetry stream and command channel to match your worker configuration.

3.  **Execution**:
    ```bash
    # Install dependencies
    npm install

    # Launch the Orchestrator
    npx tsx src/index.ts
    ```

---

## Security & Performance
* **Stream Acknowledgment**: Implements xAck to ensure telemetry data is processed reliably within the Redis Consumer Group.
* **Memory Efficiency**: Automatic raw latency buffer management to prevent memory leaks during high-concurrency sessions.
* **Smart CSR**: Optimized terminal rendering via Smart Control Sequence Rom (CSR) to minimize CPU overhead during millisecond UI refreshes.
