# Changelog

All notable changes to this project are documented here, reconstructed from the git history.

This package is a fork of [`node-red-contrib-amqp`](https://github.com/stormpass/node-red-contrib-amqp) (itself originally by Amo DelBello / meowwolf, continued by Stormpass and Corentin Pasquier). beanTech picked up the fork in September 2024 and has maintained it since, eventually renaming the package from `@stormpass/node-red-contrib-amqp` to `@beantech/node-red-contrib-amqp`.

## [1.5.0] - 2026-07-29

- Added `frameMax: 131072` to the AMQP connection options, alongside the existing 2-second heartbeat
- Cleaned up `package.json`: removed a stray self-dependency on `@beantech/node-red-contrib-amqp`, declared `amqplib`, `lodash.clonedeep` and `uuid` as `bundledDependencies` so they're packaged into the tgz
- Vendored the built `.tgz` for internal distribution

## [1.4.1] - 2025-06-10 — beanTech takeover & rebrand

*Package renamed from `@stormpass/node-red-contrib-amqp` to `@beantech/node-red-contrib-amqp`.*

- **Fixed a crash when the RabbitMQ server goes down** while a channel/connection is open on `amqp-in` (the original issue that motivated this fork's continued maintenance)
- Added `Node Help` documentation to `amqp-in`
- Added VS Code debug launch configuration for local development

### Late 2024 / early 2025 (pre-1.4.1, beanTech-maintained)

- **Refactored logging** across `amqp-in`/`amqp-out` for clearer diagnostics
- **Fixed a "channel closed" bug** in `amqp-out`
- **Added the `clientName` (Client name) field** to `amqp-in` and `amqp-out`, sent to the broker as the AMQP `connection_name` client property so connections are identifiable in the RabbitMQ management UI
  - Initially fell back to the plain node name when `clientName` was empty
  - Later changed to append a random UUID to the fallback name, to keep concurrent connections from the same node unique
  - UI field naming aligned with the other node conventions
- **Fixed multiple/duplicate connections being opened by `amqp-out`** (root cause of a memory leak)
- Added an explicit error message on publish failures in `amqp-out`
- Added stronger typing between `amqp-in`/`amqp-out` and the shared `Amqp` class, plus extra connection-state information in node status
- **`amqp-in` no longer automatically reconnects on a plain channel `close` event** (only on connection/channel errors), to avoid unwanted reconnect loops

## [1.4.0] - 2024-09-04 — beanTech fork begins

*First commit authored by beanTech (`enr-ger-bt`). Picked up from Stormpass/Corentin's upstream at this version.*

- `amqp-out`: publish errors are now caught and reported on the node (`this.error(...)`) instead of failing silently; publish is skipped with an explicit error if there is no active connection
- Added a configurable **reconnect timeout** (`reconnectTimeoutValue`) for `amqp-out`, instead of a hardcoded delay
- Minor connection/channel error logging cleanup in `Amqp.ts`

---

## Upstream history (Stormpass / Corentin Pasquier)

The following changes predate beanTech's fork and came from the upstream `stormpass/node-red-contrib-amqp` project.

## [1.4.0] - 2024-03-19

- `amqp-in`/`amqp-out` now also listen for **channel** `error`/`close` events (not just connection-level events) and trigger a reconnect

## [1.4.0] - 2024-03-12 — reconnection rework

- Replaced the `maxAttempts`-based reconnection limit with a simpler **`reconnectOnError`** checkbox: when enabled, the node keeps retrying indefinitely (every ~2s) on connection/channel errors
- Added a note documenting the manual reconnect trigger: sending `msg.payload = { reconnectCall: true }` forces a reconnect
- Contributors list updated to include Corentin Pasquier

## [1.3.0] - 2024-03-11 — `maxAttempts` (short-lived, later replaced)

- Added a **`maxAttempts`** config field to `amqp-in`, `amqp-in-manual-ack` and `amqp-out` to cap the number of reconnection attempts (`0` = unlimited)
- Logged each connection attempt (`AMQP Connection attempt X on Y`)

## [1.3.0] - 2024-03-07 — first reconnect-on-error support

- `amqp-in`/`amqp-in-manual-ack`: connection is now tracked and channel-level `error` handling added; reconnect attempted on connection `close`/`error`
- Better node status management during reconnects

## [1.4.0 → 1.3.0 renumbering] - 2024-02-26

- **Fixed a duplicate `input` event registration** on `amqp-out` (version number was rolled back from 1.4.0 to 1.3.0 alongside this fix)
- Connection errors are now emitted as node errors (`this.node.error(...)`) instead of being silently swallowed
- `amqp-in` gained an input port so it can receive a manual **reconnect** command via `msg.payload.reconnectCall`; the same was added to `amqp-out`

## [1.2.0] - 2023-06-16 — initial fork import

- Initial import of the fork into this repository, based on `@stormpass/node-red-contrib-amqp` v1.2.0
- Already included, from upstream: AMQP nodes (`amqp-broker`, `amqp-in`, `amqp-in-manual-ack`, `amqp-out`), a 2-second connection heartbeat, upgraded `amqplib` for Node 10+ compatibility, and fixed direct-routing publish issues
