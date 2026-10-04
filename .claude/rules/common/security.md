# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] Authentication/authorization verified
- [ ] Error messages don't leak sensitive data

## Project invariants (what a security review checks first)

- **The caller's identity comes only from the token.** A route gets `user_id` from
  `current_user_id_dependency`, never from the body, the path or a query parameter.
- **Ownership lives in the lookup itself.** A use case reads a user's row with a method that filters
  by owner (`find_journey_by_id_and_user_id`), never by id alone followed by a comparison in Python.
- **Someone else's row is "not found", not "forbidden".** No such row and a row owned by another
  user both raise the domain's `*NotFoundError` (404), so the response does not reveal that the id exists.
- **Every list query is scoped to the owner** (`*_by_user_id`) and excludes soft-deleted rows.
- **Cross-domain clients pass ids, not trust.** A domain receiving an id from another domain
  (places, users) re-checks it in its own store before writing it (`journeys.unknown_place`).

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or a secret manager
- Validate that required secrets are present at startup
- Rotate any secrets that may have been exposed

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Apply checks from this file + `rules/python/security.md`
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues
