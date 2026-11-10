# AI Document Chat

Upload PDFs and ask questions in plain language. Every answer is **highlighted with its sources**. Tap a number to read the exact passage and page it came from, so you never have to take the answer on trust.

![AI Document Chat: answer with highlighted citations and the evidence panel](docs/screenshot.png)

> **Live demo:** _coming soon_

---

## Why businesses use this

- **Legal & HR teams:** "What's the notice period in this contract?"
- **Customer support:** answer questions from product manuals instantly
- **Finance:** pull key dates and amounts out of long reports
- **Internal knowledge base:** a "ChatGPT for our documents" that only answers from your files

The model is told to answer **only** from your documents. If the answer isn't there, it says so instead of guessing.

## Features

**Answers you can check**
- Highlighted citation numbers in every answer. Tap one to open the **evidence panel**
- Evidence panel shows each source passage, its page, and match strength, with the question's key words highlighted
- The model answers only from your documents, and says so when the answer isn't there

**A fast, comfortable chat**
- Answers **stream in word by word**, with clear status ("Searching your documents", "Generating an answer")
- **Stop** an answer mid-way, **Ask again**, or **Copy** it
- Answers are formatted (lists, bold figures, tables)
- Follow-up questions understand the conversation so far
- Conversation is saved in the browser and survives a refresh; **New chat** starts fresh

**Easy document handling**
- **Drag and drop PDFs anywhere** on the page, or pick several at once
- Live indexing progress for each file, and clear errors you can dismiss
- **Try a sample** button loads a demo rental agreement in one click
- Tick documents to limit answers to them; filter a long library; delete with confirmation

**Built properly**
- Works on phone, tablet and desktop (library drawer and evidence sheet on mobile)
- Automatic light and dark mode
- Keyboard friendly: <kbd>/</kbd> to focus the question box, <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line, <kbd>Esc</kbd> to close panels
- Screen-reader labels, visible focus, and reduced-motion support
- Choose the AI provider: **OpenAI** or **Anthropic Claude**

| First visit | Phone | Evidence on phone |
|---|---|---|
| <img src="docs/onboarding.png" alt="First-visit screen with sample document" width="420"> | <img src="docs/mobile-answer.png" alt="Answer on a phone" width="200"> | <img src="docs/mobile-evidence.png" alt="Evidence sheet on a phone" width="200"> |

![Dark mode](docs/dark.png)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend | Next.js API routes (Node.js) |
| Database | Supabase Postgres + **pgvector** for semantic search |
| AI | OpenAI embeddings · OpenAI or Claude for answers |
| PDF parsing | unpdf |
| Hosting | Vercel (free tier works) |

## How it works

```
Upload PDF ──► extract text per page ──► split into overlapping chunks
          ──► create embeddings (OpenAI) ──► store in Supabase (pgvector)

Question ──► embed question ──► find the most similar chunks
         ──► send them to the AI with numbered references
         ──► answer with [1] [2] citations ──► show sources
```

This pattern is called **RAG (Retrieval-Augmented Generation)**.

## Project structure

```
src/
  app/
    page.tsx                  App shell: uploads, chat state, layout
    api/documents/route.ts    Upload + list documents
    api/documents/[id]/       Delete a document
    api/chat/route.ts         Streams answers with sources (NDJSON)
  components/
    Library.tsx               Document list, upload progress, filter
    Conversation.tsx          Messages, markdown, citations, actions
    Composer.tsx              Question box with stop/send
    EvidencePanel.tsx         Source passages with highlighted terms
    Toasts.tsx                Notifications
  lib/
    ai.ts                     Embeddings + streaming OpenAI/Claude answers
    client.ts                 Browser API calls, stream reader, saved chat
    chunk.ts                  Text splitting
    pdf.ts                    PDF text extraction
    supabase.ts               Database client (server only)
    config.ts                 Limits and model settings
public/sample/                Demo rental agreement (fictional)
supabase/schema.sql           Database tables and search function
```

## Run it yourself

**You need:** Node.js 20+, a free [Supabase](https://supabase.com) project, and an [OpenAI API key](https://platform.openai.com/api-keys).

1. **Clone and install**
   ```bash
   git clone https://github.com/NDevWorks/ai-document-chat.git
   cd ai-document-chat
   npm install
   ```

2. **Set up the database**
   In Supabase, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.

3. **Add your keys**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API), and `OPENAI_API_KEY`.

4. **Start**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and upload a PDF.

### Use Claude instead of OpenAI for answers

Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env.local`. OpenAI is still used for embeddings.

## Deploy to Vercel

1. Push this repo to your GitHub.
2. In [Vercel](https://vercel.com), click **Add New → Project** and import the repo.
3. Add the same environment variables from `.env.local`.
4. Click **Deploy**.

## Limitations & next steps

This is a working demo. For production use, I'd typically add:

- User login and per-user documents (Supabase Auth + row-level security)
- OCR for scanned PDFs
- Word, Excel and web page support
- Streaming answers and rate limiting
- Usage tracking and admin dashboard

## Need something like this?

I build AI features like this into business apps: document Q&A, chatbots, summaries and automation.
**Get in touch on Upwork** or open an issue on this repo.

## License

MIT
