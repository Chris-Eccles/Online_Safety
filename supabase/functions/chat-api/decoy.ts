// The decoy chat: an ordinary, dull conversation between the owner and the guest, made up on the spot.
// It is the same every time for a given chat (seeded by the chat's id), and grows naturally over time:
// a new little exchange "happens" every few days, so it looks lived in whenever it is opened.
// "g" lines are from the guest, "o" lines are from the owner.

type Line = ["g" | "o", string];
const THREADS: Line[][] = [
  [["g", "Did you end up watching that series?"], ["o", "Two episodes in. Slow start but it's getting better"], ["g", "Stick with it, episode 4 is the good one"]],
  [["o", "Is it meant to rain all weekend?"], ["g", "Saturday looks dry till about 3"], ["o", "Great, might get the grass cut then"]],
  [["g", "Have you got a decent recipe for a curry? Not too hot"], ["o", "I just use a jar and add stuff to be honest 😂"], ["o", "Korma with extra veg and a bit of lime"], ["g", "Ha fair enough, will try that"]],
  [["o", "Morning! Hope the week's started ok"], ["g", "Busy but fine thanks, you?"], ["o", "Same really. Roll on Friday"]],
  [["g", "My parcel says delivered but it's not here 🙄"], ["o", "Check the bins, mine got left in the recycling once"], ["g", "Found it. Behind the plant pot"]],
  [["o", "Car's in for its MOT tomorrow, fingers crossed"], ["g", "Good luck! Hope it's nothing expensive"], ["o", "Passed 👍 just needed a bulb"]],
  [["g", "Any good book recommendations? Need something for holiday"], ["o", "Anything by Richard Osman is an easy read"], ["g", "Ooh I've heard of those, thanks"]],
  [["o", "Did you see the match?"], ["g", "Only the second half"], ["o", "You missed the best bit then"]],
  [["g", "Coffee machine at work broke again"], ["o", "Disaster 😅"], ["g", "Productivity has dropped by about 80%"]],
  [["o", "What do you get someone who has everything for their birthday?"], ["g", "Experience day? Or a nice candle, can't go wrong"], ["o", "Candle it is"]],
  [["g", "Internet has been awful all evening"], ["o", "Mine too, think the whole area is down"], ["g", "Back now. Took long enough"]],
  [["o", "Trying to get back into running. Legs are not happy"], ["g", "It gets easier after the first couple of weeks"], ["o", "Hope so!"]],
  [["g", "Dentist tomorrow 😬"], ["o", "Hope it goes ok"], ["g", "All fine, no fillings 🙌"]],
  [["o", "Have you tried that new café in town?"], ["g", "Not yet, is it any good?"], ["o", "Cakes are great, coffee's ok"], ["g", "Sold, cake is all that matters"]],
  [["g", "Finally sorted the garden out"], ["o", "Nice one, bet that took ages"], ["g", "All afternoon. Never again 😂"]],
  [["o", "Watched a film last night, can't even remember the name already"], ["g", "Must have been a good one then 😂"]],
  [["g", "Do you know a good plumber? Tap won't stop dripping"], ["o", "Not offhand, I usually just look on the local Facebook group"], ["g", "Good shout, thanks"]],
  [["o", "Is it just me or has this week gone really slowly"], ["g", "Definitely not just you"]],
  [["g", "Trying a new pasta recipe tonight"], ["o", "What is it?"], ["g", "Some creamy mushroom thing. Will report back"], ["g", "Verdict: pretty good, needed more garlic"]],
  [["o", "Hope you had a good weekend"], ["g", "Quiet one, just what I needed. You?"], ["o", "Same, did very little 😄"]],
  [["g", "The traffic this morning was ridiculous"], ["o", "Roadworks again?"], ["g", "Yep. Third week running"]],
  [["o", "Just found out my phone storage is full"], ["g", "Too many photos?"], ["o", "About 4000 screenshots apparently 🙈"]],
  [["g", "Any idea what time the shops shut on bank holidays?"], ["o", "Usually 4 I think, maybe 5 for the big ones"], ["g", "Thanks"]],
  [["o", "Forgot my umbrella and it's chucking it down"], ["g", "Classic"], ["o", "Drowned rat"]],
  [["g", "Thinking of doing a bit of decorating"], ["o", "Which room?"], ["g", "Just the hallway, it's looking tired"], ["o", "Go for a light colour, makes it look bigger"]],
  [["o", "Do you still use that recipe app?"], ["g", "Sometimes, why?"], ["o", "Trying to find something different for tea"], ["g", "Stir fry, always works"]],
  [["g", "Long day. Sofa time"], ["o", "Well earned"]],
  [["o", "Saw a fox in the garden this morning"], ["g", "Aww! They're so cheeky"], ["o", "It took one of my gloves 😂"]],
];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type DecoyMsg = { id: number; from: "owner" | "guest"; text: string; at: string; image: null };

// Fake messages for one chat, up to now. Ids run 1..n (real decoy messages typed in are numbered after a million).
export function decoyScript(roomId: string, createdAt: string, now = Date.now()): DecoyMsg[] {
  const r = rng(seedOf(roomId));
  const order = THREADS.map((_, i) => i).sort(() => r() - 0.5);
  const day = 864e5;
  // start three weeks before the chat was made, so even a brand new chat has some history
  let t = new Date(createdAt).getTime() - 21 * day;
  t = new Date(new Date(t).toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const out: Omit<DecoyMsg, "id">[] = [];
  let k = 0;
  while (true) {
    t += Math.floor(2 + r() * 4) * day; // every 2–5 days
    const thread = THREADS[order[k % order.length]];
    k++;
    let at = t + (8 + Math.floor(r() * 13)) * 36e5 + Math.floor(r() * 60) * 6e4; // between 8am and 9pm
    if (at > now) break;
    for (const [who, text] of thread) {
      if (at > now) break;
      out.push({ from: who === "g" ? "guest" : "owner", text, at: new Date(at).toISOString(), image: null });
      at += (1 + Math.floor(r() * 25)) * 6e4 + Math.floor(r() * 60) * 1000;
    }
    if (k > 400) break;
  }
  return out.slice(-120).map((m, i) => ({ ...m, id: i + 1 }));
}
