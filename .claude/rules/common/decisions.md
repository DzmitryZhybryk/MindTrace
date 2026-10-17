# Decision records

Settled design decisions live in `.claude/decisions/`, one file per area. Before changing how an
area below behaves, or proposing an alternative to how it works, read its file: the alternative
may already have been rejected. Writing or changing an entry: skill `decision-records`.

| File | Questions it answers |
|---|---|
| `accounts.md` | which domain stores email, username and the profile; what a valid token without an account gets; how registration spans auth and users; where user preferences live |
| `domains.md` | whether tables of different domains may reference each other; where an HTTP status is decided |
| `places.md` | what a journey stores about a place and where names come from; how place names are stored per language; where place data comes from and what a provider must allow |
| `journeys.md` | what one journey record represents; what date a journey carries |
| `frontend.md` | where icons come from |
