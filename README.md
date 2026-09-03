# @beantech/node-red-contrib-amqp

Node-RED nodes for AMQP (RabbitMQ), with a fast heartbeat and automatic reconnection.

This is a fork of [@meowwolf/node-red-contrib-amqp](https://github.com/stormpass/node-red-contrib-amqp), maintained by beanTech with the following changes on top of upstream:

- Upgraded `amqplib` so it works with Node 10+
- Fixed direct-routing publish issues
- **Fast heartbeat**: the connection is opened with a 2-second AMQP heartbeat (instead of amqplib's default), so a dead/unreachable broker is detected within seconds instead of minutes
- **Automatic reconnection**: both `amqp-in` and `amqp-out` listen for `close`/`error` on the connection and channel and, when enabled, tear down and re-establish the connection automatically
- Manual reconnect trigger: `amqp-in` can be forced to reconnect on demand via an input message
- Configurable AMQP client connection name, so connections are easy to identify in the RabbitMQ management UI
- Fixed multiple/duplicate event listeners on the connection (was causing a memory leak)
- Fixed crashes when the RabbitMQ server goes down while a channel is open

## Installation

Install via the Palette Manager or from within your Node-RED user directory (typically `~/.node-red`) run:

```
npm i @beantech/node-red-contrib-amqp
```

## Nodes

This package provides an `amqp-broker` config node plus three flow nodes. See the `Node Help` panel inside Node-RED for the full list of properties on each node.

- **amqp-broker** — shared connection config (host, port, vhost, TLS, credentials)
- **amqp-in** — consumes messages from a queue/exchange, with auto-ack
- **amqp-in-manual-ack** — same as `amqp-in`, but lets the flow decide when to ack/nack/reject
- **amqp-out** — publishes messages to an exchange, with optional RPC (request/reply) pattern

### Connection resiliency

All connections opened by this package use a 2-second AMQP heartbeat, so a lost connection to the broker is detected quickly.

`amqp-in` and `amqp-out` both expose a **reconnectOnError** checkbox. When enabled:

- On a connection or channel `error`/`close` event, the node clears its current channel/connection listeners, closes what's left, and schedules a reconnect attempt (retried every ~2s) until it succeeds.
- The node status reflects the current state: `Connected`, `Disconnected`, `Reconnecting...`, `Error`, or `Unable to connect` (invalid credentials).
- `amqp-in` additionally tracks the number of active connections in its status text.

You can also force `amqp-in` to reconnect on demand by sending it a message with `msg.payload.reconnectCall = true`.

### Client name

Both `amqp-in` and `amqp-out` expose a **Client name** field, which is sent to the broker as the AMQP `connection_name` client property. This makes it much easier to tell connections apart in the RabbitMQ management UI. If left empty, a name is generated from the node name plus a random UUID.

## Development

### Build the project

```
npm run build
```

### Run tests

```
npm test
```

Run coverage:

```
npm run test:cov
```

### Create tgz file

```
npm pack
```
