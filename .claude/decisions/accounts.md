# Accounts: auth and users

## auth stores email and username; users stores only the profile
- The profile is `display_name`, `terms_accepted_at`, `marketing_emails_consent`. Each domain
  serves its own part: `/v1/auth/me/` login data, `/v1/users/me/` the profile.
- `display_name` is required; registration passes `display_name = username` in
  `CreateUserRequest`, and users never sees the username.
- Why: both were stored twice, in `user_credentials` and `users`. auth needs them to log a person
  in; users does not.
- Rejected: a copy in each domain — two sources of truth for the same fields.
- Source: PR #146, 2026-10-07

## A valid token whose account no longer exists gets 401 `auth.account_not_found`
- Why: the token identifies nobody. On 401 the frontend's refresh fails (refresh tokens cascade
  with the credentials) and it logs out; `SESSION_INVALID_CODES` needs no change.
- Rejected: 404 `auth.user_credentials_not_found` (until 2026-10-12) — not a session-ending code,
  so a frontend consumer would keep the dead session.
- Source: PR #146, 2026-10-12

## Registration is one synchronous transaction across auth and users
- auth creates the credentials and calls users through `UsersClientPort` inside one
  `uow.transaction()`; users writes to the same session and does not commit.
- Why: both domains share one Postgres, so one transaction gives strict consistency for free.
- Rejected: creating the profile in a procrastinate task (atomic defer, outbox) — only the enqueue
  is atomic; a failed task does not roll registration back. That consistency window is justified
  only by separate databases.
- Rejected: a saga with compensation — undoing a successful registration of a logged-in user over a
  local INSERT is wrong; asynchronous creation rolls forward, not back.
- Revisit when: users moves to its own database or service. Then: an idempotent task
  (`INSERT … ON CONFLICT (user_id) DO NOTHING`) deferred atomically in the registration
  transaction, plus monitoring of failed jobs. Never a saga.
- Source: 2026-06-13

## There is no generic `user_preferences` table
- A UI preference (language, theme) becomes a nullable column on `users`. A domain preference
  (e.g. travel interests) belongs to its own domain.
- Why: a separate table for one or two fields is not justified; a column on `users` is cheaper.
- Rejected: a generic preferences table — same reason.
- Revisit when: at least three independent mutable preferences exist.
- Source: i18n feature (DEV-22)
