# WESKit Backend

This backend provides REST API endpoints for genomic data analysis using Nextflow and WESKit, with PostgreSQL for job tracking.

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create PostgreSQL database `weskit_db` and update credentials in `src/index.js`.
3. Run schema:
   ```bash
   psql -U postgres -d weskit_db -f src/schema.sql
   ```
4. Start backend:
   ```bash
   npm start
   ```

## Endpoints
- `POST /api/upload` — Upload .tar.gz file
- `POST /api/run/:jobId` — Start Nextflow pipeline
- `GET /api/status/:jobId` — Get job status
- `GET /api/result/:jobId` — Download results
