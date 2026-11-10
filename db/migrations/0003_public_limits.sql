CREATE TABLE public_request_limits (
  client_hash TEXT PRIMARY KEY,
  requests INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
