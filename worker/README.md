# Standards AI server

The page at `wrastem.com/standards-ai/` works on its own as a search of the full
NGSS text. This small server adds the chat: it explains science ideas in plain words,
tells teachers what the NGSS expects at each grade, and suggests ways to teach it. It runs on Cloudflare's
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
this server at `/purchase`, which emails them to you. Pressing **Reply** in that email
answers the teacher directly. It's free: Cloudflare delivers to a verified address in your
own account at no charge, on the Workers Free plan.

One-time setup in the Cloudflare dashboard (about 3 minutes):

1. **Compute → Email Service → Email Routing → Onboard Domain**, pick `wrastem.com`, then
   **Done**. Cloudflare adds the email DNS records itself (the site had none before).
2. **Email Routing → Destination Addresses**: add the inbox that should get requests,
   then open the email Cloudflare sends there and click **Verify email address**.
3. That inbox is saved on the server as a secret, not in this code. To change it:
   `npx wrangler secret put NOTIFY_TO`

Every request is also written to the Logs (Workers & Pages → `standards-ai` → Logs, look
for `purchase`), so if an email ever fails you can still find it there for 7 days. A
hidden "website" field catches most spam bots, and one visitor can send at most a few
requests a minute.

## What happens when the free allowance runs out

The AI stops until 00:00 UTC (8 pm Eastern in winter). The page says answers are
resting and still shows the matching standards word for word. Nothing is charged.

About how many answers a day fit in the free allowance:

| Model (in `wrangler.jsonc`) | Answers a day | Notes |
|---|---|---|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (current) | about 60 | Follows the rules most strictly |
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

It talks like a helpful colleague. Its main source is the NGSS; it may also use
well-established general science (what a mitochondrion is) and common teaching ideas
(group work, models, exit tickets). The two are always kept apart:

1. The server holds its own copy of the NGSS text (`standards-ai/ngss.json`), all
   208 performance expectations with their clarification statements, assessment
   boundaries, practices, core ideas and crosscutting concepts.
2. For each question it finds the matching performance expectations and gives the
   model that text. Anything the answer says the NGSS says must carry that
   standard's code, like `[MS-LS1-2]`, which the page links to nextgenscience.org.
3. Before an answer goes out, every sentence with a code is checked against the
   standard it cites:
   - quotes must appear word for word;
   - assessment boundaries may be quoted, or put in plain words only if nearly every
     word comes from the boundary itself;
   - its science words must actually be in that standard. If not, a sentence that
     claims to be the NGSS is cut, and a plain science sentence keeps its words but
     loses the code;
   - a grade that doesn't match the standard ("middle school" on a 4th-grade
     standard) is corrected;
   - a quote of NGSS text with no code gets the right code added.
4. Lines without a code are general science or teaching advice, and the page says so
   under each answer.

Follow-up questions ("explain that more simply", "what about high school?") use the
last three turns of the chat. The model (Llama, made by Meta) knows general science
from its training; it is told never to make up codes, quotes, studies or links.

The prompt also tells it, when a teacher asks for plant cell activities, that it may
mention the WRA STEM Kits plant cell model in one sentence. To change that, edit rule
11 of `SYSTEM` in `src/index.js` and deploy again.

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
