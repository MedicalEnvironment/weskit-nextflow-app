import express from 'express';
import multer from 'multer';
import { Pool } from 'pg';
// import weskit from 'weskit'; // Placeholder: actual WESKit usage depends on its API
import axios from 'axios';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 3001;

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'weskit_db',
  password: 'qwerty123',
  port: 5432,
});

// Multer setup for file uploads
const upload = multer({ dest: '/home/keygen/genomic_data/' });

// API: Upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  // Save file info to DB
  const { originalname, filename, path: filepath } = req.file;
  const result = await pool.query(
    'INSERT INTO uploads (originalname, filename, filepath, status) VALUES ($1, $2, $3, $4) RETURNING id',
    [originalname, filename, filepath, 'uploaded']
  );
  res.json({ jobId: result.rows[0].id });
});

// API: Start pipeline
app.post('/api/run/:jobId', async (req, res) => {
  // Get file info from DB
  const { jobId } = req.params;
  const fileRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [jobId]);
  if (!fileRes.rows.length) return res.status(404).send('Job not found');
  const { filepath, filename } = fileRes.rows[0];

  // Submit job to WESKit (example REST API usage)
  try {
    const weskitRes = await axios.post('http://localhost:8080/ga4gh/wes/v1/runs', {
      workflow_url: '/home/keygen/weskit/fastqc_subworkflow.nf',
      workflow_params: {
        dataDir: path.dirname(filepath),
        fastqFiles: filename
      },
      tags: { jobId }
    });
    const weskitJobId = weskitRes.data.run_id;
    await pool.query('UPDATE uploads SET status = $1, weskit_job_id = $2 WHERE id = $3', ['running', weskitJobId, jobId]);
    res.json({ status: 'started', weskitJobId });
  } catch (err) {
    await pool.query('UPDATE uploads SET status = $1 WHERE id = $2', ['error', jobId]);
    res.status(500).json({ error: 'WESKit job submission failed', details: err.message });
  }
});

// API: Get job status
app.get('/api/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const result = await pool.query('SELECT status, weskit_job_id FROM uploads WHERE id = $1', [jobId]);
  if (!result.rows.length) return res.status(404).send('Job not found');
  const { status, weskit_job_id } = result.rows[0];
  if (!weskit_job_id) return res.json({ status });
  try {
    const weskitRes = await axios.get(`http://localhost:8080/ga4gh/wes/v1/runs/${weskit_job_id}/status`);
    res.json({ status: weskitRes.data.state });
  } catch (err) {
    res.json({ status });
  }
});

// API: Get results
app.get('/api/result/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const result = await pool.query('SELECT weskit_job_id FROM uploads WHERE id = $1', [jobId]);
  if (!result.rows.length) return res.status(404).send('Job not found');
  const { weskit_job_id } = result.rows[0];
  if (!weskit_job_id) return res.status(404).send('No WESKit job for this upload');
  try {
    const weskitRes = await axios.get(`http://localhost:8080/ga4gh/wes/v1/runs/${weskit_job_id}/outputs`);
    // Assume outputs contains URLs or file paths for HTML and ZIP
    res.json({ outputs: weskitRes.data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch WESKit outputs', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`WESKit backend listening on port ${port}`);
});
