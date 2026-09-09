# Element picker

**Status:** built (prototype).

Pointing at something in the preview and talking about it, instead of
describing it in words.

Technical counterpart: [architecture/element-picker.md](../architecture/element-picker.md).

## The problem

The hardest part of a designer working with an agent is pointing at things.
"The button" is ambiguous. "The third card in the second row" is exhausting to
type and easy to get wrong.

## What it is

The designer points directly. Pick an element in the preview, and a reference
to it goes into the chat input as part of the message being composed. From
there the conversation continues normally: "make this bigger", "this should be
a link", "why does this jump on hover". The agent knows exactly which element
is meant, because the designer pointed at it rather than described it.

The reference should carry as much precision as is available. When the preview
can tell us where an element actually comes from, that is what should reach the
agent, because it is what lets the agent act confidently. When it cannot, a
reliable pointer to the element plus enough surrounding detail to identify it
should be sent instead. In every case, the designer should not have to think
about which of these is happening.

## How it should feel

Selecting an element should feel like using a design tool: hovering shows what
would be picked, picking is a single deliberate action, and it is obvious what
was captured and where it went.

The reference belongs to the message being composed. It is not sent on its own,
and it does not interrupt the conversation — the designer picks, then keeps
typing.

## Where we are

Works end to end. The designer arms picking, hovers to see what would be
picked, clicks to commit, and a reference to that element appears in the chat
input as part of the message being composed. The reference favours source
location when the previewed page exposes one, and otherwise falls back to a
stable pointer to the element.

One element per message for now.

## Open questions

- What else, beyond a single element, is worth capturing and sending to the
  conversation.
- Whether the designer should be able to pick several elements into one
  message, rather than one at a time.
- What should happen if the designer picks an element while there is no
  conversation open to receive it (for example, from a landing screen rather
  than an active session). Right now the pick still completes but the reference
  has nowhere to go, which is not the calm, obvious behaviour the feature is
  meant to have.
- Whether the reference should read as a compact chip in the composer, the way
  file mentions already do, rather than as inline text.
