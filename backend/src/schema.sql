CREATE TABLE IF NOT EXISTS uploads (
  id SERIAL PRIMARY KEY,
  originalname TEXT,
  filename TEXT,
  filepath TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
