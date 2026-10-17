# Places: geo and the places of a journey

## A journey stores a place as `place_id` plus country and coordinates from geo, never the name
- The client sends only place ids. journeys asks geo once, before its own transaction, for the
  country and coordinates of each place (`PlacesClientPort.find_place_locations`) and matches the
  answer by `place_id`, never by position. geo knows nothing about its consumers.
- The frontend gets names from geo (`/v1/geo/places/resolve/`) in the UI language.
- Why: journeys must not know about languages, and storing every language in a journey does not
  scale. A place is identified by `place_id`, not by coordinates or name.
- Rejected: a name snapshot in the autocomplete's language (until 2026-09-29) — one city added in EN
  and in RU lived as two places (Moscow / Москва) and did not follow a UI language switch.
- Rejected: a snapshot in both en and ru — a migration per language, translations frozen at
  creation.
- Rejected: country and coordinates sent by the client (until 2026-10-10) — journeys stored the
  client's numbers instead of geo's.
- Source: PR #116, 2026-09-29; PR #137, 2026-10-10

## Place names are one column per language in `geo_places`
- `name_en` is required, other languages are nullable; a new language is a new column.
- Why: alternative names ("Питер") and the source of a translation are not needed.
- Rejected: a separate names table (until 2026-09-30) — built, measured 4–9× slower on short
  prefixes, rolled back.
- Source: 2026-09-30

## The gazetteer is our own dataset loaded into Postgres
- Places come from our own datasets (GeoNames + Wikidata, published as `geo-data-vN` release
  assets) loaded into Postgres; no geocoder at runtime.
- A geodata provider must allow storing coordinates and codes indefinitely — that is the criterion
  for choosing one.
- Why: journeys keep place ids and coordinates forever.
- Rejected: Google Places — coordinates may be kept for at most 30 days and names not cached, so
  every read would need a request.
- Rejected: self-hosted Photon — ~90–95 GB of disk, and the prebuilt index has no Russian (a Russian
  index means a full Nominatim import of the planet).
- Revisit when: the Russian coverage of the dataset proves insufficient — a freemium geocoder is the
  fallback.
- Source: 2026-06-16; provider criterion 2026-09-29
