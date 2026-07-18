# Sponsor Marquee Design

## Goal

Replace the current home-page introduction hero with a sponsor thank-you area. Display sponsor names as a restrained two-lane marquee and let administrators maintain the shared sponsor list without publishing a new mini-program version.

## Home Experience

The existing home hero keeps its current dimensions, dark background, gold accents, and red corner decoration. Its content changes to:

- Eyebrow: `THANKS TO OUR SPONSORS`.
- Title: `感谢每一位秘马赞助商`.
- Supporting copy thanking people who support the in-house community.
- Two horizontal lanes of sponsor-name chips.

The lanes move continuously in opposite directions at slightly different speeds. Each lane duplicates its content internally so the loop has no visible gap. Motion stays inside the hero and must not block the title or supporting copy.

Sponsor chips use the existing gold-on-dark visual language. The animation uses only CSS/WXSS transforms, has no timers in page JavaScript, and does not react to taps.

When the sponsor list is empty, the hero displays the static sentence `感谢每一位支持秘马内战的朋友` and does not show empty moving lanes. A single sponsor is repeated visually for a smooth loop, but remains one database entry.

## Sponsor Data

Store sponsor names in the existing shared system configuration document as a `sponsors` string array. The bootstrap response includes the normalized list so every signed-in user sees the same names.

Normalization rules:

- Trim surrounding whitespace.
- Reject an empty name.
- Limit each name to 20 visible characters.
- Compare trimmed names exactly and reject duplicates.
- Preserve administrator-defined display order.
- Limit the list to 50 sponsors.

The client creates two display lanes from the same list with different starting offsets. Those repeated display arrays are presentation-only and are never written to the database.

## Administrator Management

Add a compact `赞助商管理` section to the existing administrator panel on the room page. It contains:

- One text input for a sponsor name.
- An add button.
- The current sponsor list, with a delete action on each row.

Adding or deleting refreshes shared bootstrap data immediately. The input is cleared only after a successful add. Deletion requires a confirmation modal to avoid accidental removal.

Ordinary members do not see this management section.

## Cloud Actions And Authorization

Add protected cloud actions for adding and deleting sponsor names. Both actions call the existing administrator assertion before reading or writing configuration.

The server repeats every normalization, length, duplicate, and capacity check. It does not trust the client-provided list or administrator state. Updates modify only the `sponsors` field and the configuration update timestamp.

Errors shown to users are concise Chinese business messages. A failed write leaves the previous list and client input unchanged.

## Compatibility

Existing configuration documents without a `sponsors` field are treated as an empty list. No one-time migration or new database collection is required.

The home statistics, current room panel, rankings, signup flow, and tab navigation remain unchanged below the hero.

## Verification

Regression coverage will prove:

- Missing sponsor configuration produces the static empty state.
- Sponsor names are trimmed, ordered, deduplicated, length-limited, and capacity-limited.
- Only administrators can add or delete sponsors.
- Bootstrap returns the shared sponsor list.
- The home page renders two marquee lanes when sponsors exist.
- The home page renders no moving lanes when the list is empty.
- The administrator panel exposes add and confirmed-delete controls only to administrators.
- Existing home, room, ranking, signup, and cloud authorization tests remain green.
