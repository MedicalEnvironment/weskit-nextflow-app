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

// Multer setup for file uploads (project-relative)
const uploadDir = path.join(__dirname, '..', 'uploads');
const outputDir = path.join(__dirname, '..', 'results');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const upload = multer({ dest: uploadDir });

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
    const workflowPath = path.join(__dirname, '..', '..', 'nextflow', 'fastqc_subworkflow.nf');
    const workflowConfig = path.join(__dirname, '..', '..', 'nextflow', 'nextflow.config');
    const weskitRes = await axios.post('http://localhost:8080/ga4gh/wes/v1/runs', {
      workflow_url: workflowPath,
      workflow_params: {
        dataDir: uploadDir,
        fastqFiles: filename,
        outputDir: outputDir
      },
      workflow_engine_parameters: {
        config: workflowConfig
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
    // Serve result files directly if available in outputDir
    const outputs = weskitRes.data.outputs || [];
    const files = outputs.map(out => {
      const filePath = path.join(outputDir, out.name || out.path || '');
      if (fs.existsSync(filePath)) {
        return {
          name: out.name || out.path,
          url: `/api/download/${jobId}/${encodeURIComponent(out.name || out.path)}`
        };
      }
      return null;
    }).filter(Boolean);
    res.json({ outputs: files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch WESKit outputs', details: err.message });
  }
});

// Serve result files for download
app.get('/api/download/:jobId/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(outputDir, filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(port, () => {
  console.log(`WESKit backend listening on port ${port}`);
});
