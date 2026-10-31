---
paths:
  - "backend/app/**"
---
# External calls: the adapter classifies, the caller decides

An adapter of an external dependency (an HTTP API client, object storage, a future LLM proxy)
turns every failure of a call into one of two exceptions and does nothing else about it: no
retries beyond what the SDK does inside one call, no HTTP status, no translation into a domain
error. Retrying the task, answering 503 or mapping the failure onto a domain error is the
caller's decision.

## What an adapter's exception module declares

1. **The family marker** — `<Family>Error(BaseDomainError)`: a docstring and, where the family
   carries call context (method, URL, upstream status), an `__init__`; no `category`, `code` or
   `message` of its own.
2. **The temporary leaf** — `<Family>TemporaryError(<Family>Error, TemporaryError)`, with no
   `code` override: the wire code is always `temporary`; the client has one reaction to every
   temporary failure, and which dependency failed is the log's business.
3. **The persistent leaf** — `<Family>PersistentError(<Family>Error, InternalError)`, with a
   `code` of its own.

The marker comes first so `except` and a port's `Raises:` can name the family; the category base
comes second and is where `category`, `code` and `message` resolve from — the family's unit tests
pin the category of each leaf. Every leaf is raised `from` the SDK exception: the cause keeps the
upstream error code, and the request log writes a server-side error with its traceback.
Diagnostic context goes into `details` or attributes; the HTTP envelope drops both for a
server-side category.

## Where the boundary runs

| The SDK reports | Classification |
|---|---|
| any 5xx; 429; 408 | temporary |
| a timeout, a connection error, a broken response body | temporary |
| an error code the SDK retries itself in its standard mode (botocore: `RequestTimeout`, `SlowDown`, …) | temporary |
| any other 4xx; a request that could not be built (parameters, signature, credentials) | persistent |

The SDK's own retries, milliseconds apart, are exhausted when the exception reaches the adapter;
this classification serves the second tier, a task retried minutes later.

| The thought | The answer |
|---|---|
| "500 is usually a deterministic bug" | A deterministic 500 costs the task its `max_attempts`; a transient 500 classified persistent costs the job |
| "429 needs `Retry-After` and backoff, which this class cannot provide" | The task's retry strategy is the backoff; the adapter only says the failure is temporary |
| "The port is bound to this one provider, the task can name its class" | The task retries on `TemporaryError`; a second provider changes nothing in it |

## What the caller does with it

- A task retries on `TemporaryError`, never on an adapter's class.
- A request path lets the exception propagate: 503 for `TemporaryError`, 500 for the
  persistent leaf. A use case catches a leaf only to translate it into a domain error of its own.
- A port's `Raises:` names the categories when the port is transport-agnostic, the family when
  the port exists for that one adapter.
