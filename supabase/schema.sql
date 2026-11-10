-- AI Document Chat: database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).

create extension if not exists vector;

-- One row per uploaded file
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page_count int not null default 0,
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Small pieces of each document, with an embedding for semantic search
create table if not exists chunks (
  id bigserial primary key,
  document_id uuid not null references documents(id) on delete cascade,
  page int not null,
  content text not null,
  embedding vector(1536) not null
);

create index if not exists chunks_document_id_idx on chunks(document_id);
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);

-- Find the chunks most similar to a question.
-- Pass filter_document_ids = null to search all documents.
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  filter_document_ids uuid[] default null
)
returns table (
  id bigint,
  document_id uuid,
  document_name text,
  page int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    d.name as document_name,
    c.page,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where filter_document_ids is null or c.document_id = any(filter_document_ids)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- The app talks to the database only from the server using the service role key,
-- so lock the tables down for the public (anon) key.
alter table documents enable row level security;
alter table chunks enable row level security;
