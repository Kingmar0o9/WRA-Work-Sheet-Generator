# Standards AI server

The page at `wrastem.com/standards-ai/` works on its own as a search of the full
NGSS text. This small server adds the chat: a teaching assistant that explains science ideas
in plain words (and again another way if they don't click), helps teachers explain them to
students, plans lessons with them, and shows where each idea is in the NGSS. It runs on Cloudflare's
**free** Workers plan, and nothing in it can create a bill.

## Turn it on (one time, about 5 minutes)

On your own computer:

1. Install Node.js (the "LTS" version) from nodejs.org, if you don't have it.
2. Get the project: on GitHub, **Code → Download ZIP**, then unzip it
   (or `git clone https://github.com/Kingmar0o9/WRA-Work-Sheet-Generator`).
3. Open a terminal in the `worker` folder and run:

```bash
npm install
```

```bash
npx wrangler login
```

   A browser window opens. Sign in to the Cloudflare account that owns wrastem.com
   and click **Allow**.

```bash
npx wrangler deploy
```

4. Check it: open `https://ai.wrastem.com/health`. You should see
   `"ok":true` and `"standards":208`. The Standards AI page now writes answers.

To change anything later (the model, the rules), edit the files and run
`npx wrangler deploy` again.

## Where to manage it

All of this is in the Cloudflare dashboard (dash.cloudflare.com):

| What | Where |
|---|---|
| **Questions people asked** | Workers & Pages → `standards-ai` → **Logs**. Each line shows the question, which standards it used, and whether an answer was written. Kept 7 days. Live view from a terminal: `npx wrangler tail` |
| **Traffic** | Workers & Pages → `standards-ai` → **Metrics** |
| **AI used today** | AI → Workers AI → usage. The free allowance is 10,000 neurons a day |
| **Whether you are paying** | Manage Account → **Billing**. Your plan should say **Workers Free**. You only pay if you upgrade to Workers Paid yourself |

Only questions that need a written answer reach the server. A bare code such as
`MS-LS1-2` is answered on the page and does not appear in the logs. "hi", "thanks" and
"who are you" get a ready-made reply without using the AI (they show as `small_talk`).

## Purchase requests (wrastem.com/purchase)

The "Request kits" form sends its answers (number of sets, name, school, email, message) to
this server at `/purchase`, which emails them to you. The form has an "I agree to the
Privacy Policy" box (`wrastem.com/privacy`); the server refuses a request without it. Pressing **Reply** in that email
answers the teacher directly. It's free: Cloudflare delivers to a verified address in your
own account at no charge, on the Workers Free plan.

One-time setup in the Cloudflare dashboard (about 3 minutes):

1. **Compute → Email Service → Email Routing → Onboard Domain**, pick `wrastem.com`, then
   **Done**. Cloudflare adds the email DNS records itself (the site had none before).
2. **Email Routing → Destination Addresses**: add the inbox that should get requests,
   then open the email Cloudflare sends there and click **Verify email address**.
3. That inbox is saved on the server as a secret, not in this code. To change it:
   `npx wrangler secret put NOTIFY_TO`

#### A second inbox

To have every request also go to another address (a second account of yours, or a teammate):

1. **Email Routing → Destination Addresses**: add the second address and click the link in
   the email Cloudflare sends there. Until that is done, Cloudflare refuses to deliver to it;
   the first inbox still gets every request.
2. Save it on the server as its own secret (it asks you to paste the address):

   ```bash
   npx wrangler secret put NOTIFY_ALSO
   ```

Each inbox gets its own copy, ending with "Also sent to: ..." so you can see who else has it.
Pressing Reply answers the teacher from whichever inbox you are in; the other inbox does not
see that reply, so agree who answers. A teacher's reply to the thank-you email reaches both.
For more than two, put several addresses in `NOTIFY_ALSO` with commas between them. To stop:
`npx wrangler secret delete NOTIFY_ALSO`.

Every request is also written to the Logs (Workers & Pages → `standards-ai` → Logs, look
for `purchase`), so if an email ever fails you can still find it there for 7 days. If one of
two inboxes could not be emailed, the line says `emailed_1_of_2` and a `purchase_email_error`
line beside it says why. A
hidden "website" field catches most spam bots, and one visitor can send at most 3
requests a minute.

### The teacher's thank-you email

Right after a request, the teacher can get one thank-you email from `kits@wrastem.com`:
"Thank you for requesting a kit!", their request (sets and school), a picture of the kit and
what it gives them (`src/thank-you.js`; the pictures are in `../assets/img/email/`). Pressing
Reply reaches your inbox (`NOTIFY_TO`, and `NOTIFY_ALSO` if you set one). The form's thank-you page then adds "I've also sent
you a thank-you email".

It is sent through [Resend](https://resend.com)'s free plan (100 emails a day, 3,000 a
month), because Cloudflare's free plan can only email addresses in your own account. **It is
off until you set the key**, so deploying this code changes nothing teachers see.

- No thank-you goes to a request marked **Check this one**, so nobody can use the form to
  send email to someone else's address.
- If Resend fails or the day's 100 emails are used up, the teacher still sees "Thank you",
  you still get the request, and the error goes to the Logs (`thank_you_error`).
- Your request email has a **Thank-you email** line: `sent`, `not sent` (and why) or `failed`.

To turn it on (about 10 minutes):

1. Merge the pull request first, so the email's pictures are on wrastem.com.
2. Make a free account at resend.com. Under **Domains**, add `wrastem.com`.
3. Resend shows a few DNS records (on a `send.` subdomain, so your email routing is not
   affected). Add each one in Cloudflare under **wrastem.com → DNS → Add record**, then press
   **Verify** in Resend.
4. In Resend, under **API Keys**, create a key with "Sending access" and copy it.
5. In this folder, save it on the server (it asks you to paste it; it never goes in the code):

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

6. Deploy:

   ```bash
   npm run deploy
   ```

7. Send the Request kits form to yourself and check the email on your phone, in light and
   dark mode.

To turn it off again: `npx wrangler secret delete RESEND_API_KEY`.

### Who sent this (spotting fake requests)

Every request email ends with a **Who sent this** part. No request is ever blocked by it;
it only tells you what to look at before you reply.

| Line | What it is |
|---|---|
| **Verdict** | `Looks like a real school`, `Can't tell` or `Check this one`. A "check this one" request also says so in the email's subject |
| **Why** | The reasons, in plain words |
| **IP address** | The internet address the form was sent from |
| **Location** | The city, state, country, postal code and time zone Cloudflare has for that IP address |
| **Network** | Who owns that address: a home internet company, a school district, a phone company, a data center |
| **Map** | A link that opens the rough spot on OpenStreetMap |

How the verdict is worked out:

- **Looks like a real school:** the email is at a school-style address (`.edu`, `k12`,
  `...schools.org`, `...isd.org`) or at an address named after the school they typed
  (`wra.net` for Western Reserve Academy), and that address can receive email. Or the
  form was sent from a school's own network.
- **Check this one:** the email is a throwaway address, or its domain doesn't exist or has
  no mail server (so your reply could never arrive), or the form came through Tor, or it
  came through a data center or VPN with nothing else to vouch for it.
- **Can't tell:** everything else. Most often a real teacher writing from a personal
  address such as Gmail, at home.

What it can't do:

- **It can't give a street address.** An IP address only shows a rough area, and a teacher
  at home or on a district network can show up a town or more away.
- **It can't prove someone owns an email address.** Anyone can type any address. The proof
  is that its owner answers when you reply.

If you change what is collected or how long it is kept, change `privacy/index.html` to
match, and its effective date.

The same details are written to the Logs with each `purchase` line (kept 7 days). To see
your own, send the form yourself: the email you get shows your IP address and location.
The lists of personal and throwaway email providers, and the words that mark a school
address or a school network, are near `Who sent a kit request` in `src/index.js`.

## Who can use the server

Only the pages on `wrastem.com`. A question or a kit request from any other website, or
from a script with no website at all, gets a "forbidden" reply and uses no AI and sends
no email. On top of that:

- one visitor can ask at most 6 questions and send 3 kit requests a minute;
- only small JSON messages are read (64 KB for a question, 16 KB for a request);
- an email address may only contain the characters real addresses use, so nothing typed
  into the form can add other recipients;
- if something breaks inside the server, the visitor sees only "server_error"; the
  details go to the Logs;
- every reply tells the browser not to put it in a frame, not to guess its type, not to
  keep a copy, and to use HTTPS.

To let a page on your own computer use the live server too (for example the site opened
at `http://localhost:8000`), add that address to `ALLOWED_ORIGINS` under `vars` in
`wrangler.jsonc` and deploy. Leave it out unless you need it. A test copy started with
`npx wrangler dev` reads the same setting:

```bash
npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:8000
```

To check that the protections still work after a change (it uses stand-ins for the AI and
the email service, so it touches nothing real):

```bash
npm test
```

## What happens when the free allowance runs out

The AI stops until 00:00 UTC (8 pm Eastern in winter). The page says answers are
resting and still shows the matching standards word for word. Nothing is charged.

About how many answers a day fit in the free allowance:

| Model (in `wrangler.jsonc`) | Answers a day | Notes |
|---|---|---|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (current) | about 50 to 70 | Follows the rules most strictly |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | about 400 | Less careful; more answers get thrown out by the citation check |

A repeated question is served from a cache for a week and costs nothing.

## How it finds the right standard

1. **Spelling help (in the browser and on the server):** a word the standards never use is
   swapped for the closest one they do, including swapped or fully scrambled letters
   (`mitocondria`, `mtiochondira`, `aidnorhcotim` all become `mitochondria`).
2. **Routing (server):** a small, cheap model (`ROUTER_MODEL`) works out what a messy search
   meant ("the powerhouse thing in cells" -> mitochondria) and which grade band. It does not
   answer anything.
3. The search runs on those words. A grade band in the question keeps that band's standards
   first, plus the two best from other grades, so the answer can say where a topic is taught.
4. The page shows "Showing standards for ..." and jumps to the best match.

## How it answers

It talks like a friendly teaching assistant: the answer first, in plain words, then the facts.
The server picks one of these modes for each message and tells the model which one:

| Mode | When | What the answer looks like |
|---|---|---|
| explain | "What are mitochondria?" | 1–2 sentence answer, 3–4 bullet facts, an everyday comparison, one sentence on where it is in the NGSS, one offer of a next step |
| again | "I don't get it", "simpler", "huh?" | The same idea in new, simpler words with a different comparison, then "Does that make more sense?" As many times as asked |
| students | "How do I explain this to my 6th graders?" | Say it like this / Try this / Ask the class / Watch for |
| teaching | "My students are bored" | 2–3 concrete ideas, then one question back |
| plan-ask | "Help me plan an activity on cells" (grade unknown) | 2–3 short questions: grade or age, time, materials |
| plan-write | after they answer, or "just pick for me" | Goal, You'll need, Steps with times, Questions to ask, Quick check |

Follow-ups use the last six turns of the chat.

### Where the facts come from

1. **Science notes** (`standards-ai/science.json`): short, checked explanations of about 60
   common K–12 topics (cells and their parts, photosynthesis, forces, the water cycle,
   plate tectonics and more), each with key facts, an everyday comparison and common mix-ups.
   The matching notes go to the model with every question so the science is right. They are
   general science, never cited as the NGSS. To add or fix a topic, edit the file (`a` is the
   list of words that find it) and deploy again.
2. **The NGSS text** (`standards-ai/ngss.json`): all 208 performance expectations with their
   clarification statements, assessment boundaries, practices, core ideas and crosscutting
   concepts. For each question the server finds the matching standards and gives the model
   that text.
3. The model's own general science knowledge and common teaching ideas fill the gaps. It is
   told never to make up codes, quotes, studies or links.

### How the NGSS part is checked

Anything the answer says the NGSS says must carry that standard's code, like `[MS-LS1-2]`.
Before an answer goes out, every sentence with a code is checked against the standard it cites:

- quotes must appear word for word;
- assessment boundaries may be quoted, or put in plain words only if nearly every word comes
  from the boundary itself;
- its science words must actually be in that standard. If not, a sentence that claims to be
  the NGSS is cut, and a plain science sentence keeps its words but loses the code;
- a grade that doesn't match the standard ("middle school" on a 4th-grade standard, or
  "7th grade" where the NGSS says middle school) is corrected;
- a quote of NGSS text with no code gets the right code added.

The page hides the codes inside the answer, so it reads like normal conversation. Under the
answer, **Find it in the NGSS** opens the standard it used at the exact spot where the topic
appears (for mitochondria, the clarification statement of MS-LS1-2), with the word highlighted,
the whole standard one tap away, and a link to nextgenscience.org.

The prompt also tells it, when a teacher plans something on plant cells, that it may mention
the WRA STEM Kits plant cell model in one sentence. To change that, edit the last line of
`SYSTEM` in `src/index.js` and deploy again.

## Keeping the standards text current

The NGSS were published in 2013, and nextgenscience.org hosts the official text.
To refresh the copy (for example, if the site posts corrections):

```bash
bash src/ngss-pipeline/crawl_ngss.sh OUT_DIR
```

```bash
python3 src/ngss-pipeline/build_ngss.py OUT_DIR standards-ai/ngss.json YYYY-MM-DD
```

```bash
python3 src/ngss-pipeline/check_complete.py standards-ai/ngss.json
```

The last command must report `missing: none`. The site's search listing has left
out a few standards before (K-PS3-1, K-PS3-2, HS-ESS2-1, HS-ESS2-3); fetch any it
names directly from `https://www.nextgenscience.org/pe/<code>-...` and build again.
Then commit, push, and run `npx wrangler deploy` so the server has the same text.

## Upkeep

Cloudflare retires older models now and then. If answers stop for days at a time,
open the Workers AI model list in the dashboard, pick a current text model, put
its name in `wrangler.jsonc` under `MODEL`, and deploy again.
