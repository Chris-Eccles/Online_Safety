# abity.co.uk home page

The front door for abity.co.uk: one link that takes students to CS Online (hw.abity.co.uk)
and staff to Staff CPD (cpd.abity.co.uk). Any other address on abity.co.uk comes back here.

The old Online Ready site is kept, unchanged, on the `online-ready-archive` branch.

## chat/ (chat.abity.co.uk)

A private chat site, deployed by its own Vercel project (`chat`, root directory `chat/`).
Its server is the Supabase Edge Function in `supabase/functions/chat-api/` (Abity CPD project).
Chats are created on chat.abity.co.uk/admin (or via the Admin button on abity.co.uk).
