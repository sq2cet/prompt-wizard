# Phase 7: Data — Exchange

> Protocols, sync vs async, timeouts, retry policy, error responses.

**Mode:** detailed

## How does this system talk to others?
> REST, GraphQL, gRPC, WebSocket, message queue, file transfer — list each integration.

HTTPS POST to a single configurable webhook.

## Are external calls synchronous or asynchronous?

Synchronous — caller waits for the response (`sync`)

## When an external call fails, what happens?

Retry a few times with backoff (`retry_simple`)
