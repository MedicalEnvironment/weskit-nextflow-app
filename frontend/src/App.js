import React, { useState } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';


function App() {
  const [jobId, setJobId] = useState(null);
  const [weskitJobId, setWeskitJobId] = useState(null);
  const [status, setStatus] = useState('');
  const [outputs, setOutputs] = useState([]);
  const [error, setError] = useState('');

  const onDrop = async (acceptedFiles) => {
    setError('');
    const formData = new FormData();
    formData.append('file', acceptedFiles[0]);
    try {
      const res = await axios.post('/api/upload', formData);
      setJobId(res.data.jobId);
      setStatus('uploaded');
    } catch (err) {
      setError('Upload failed');
    }
  };

  const startPipeline = async () => {
    setError('');
    try {
      const res = await axios.post(`/api/run/${jobId}`);
      setStatus('running');
      setWeskitJobId(res.data.weskitJobId);
      pollStatus();
    } catch (err) {
      setError('Pipeline start failed');
    }
  };

  const pollStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`/api/status/${jobId}`);
        setStatus(res.data.status);
        if (res.data.status === 'COMPLETE' || res.data.status === 'finished') {
          fetchOutputs();
          clearInterval(interval);
        }
        if (res.data.status === 'ERROR' || res.data.status === 'error') {
          setError('Pipeline failed');
          clearInterval(interval);
        }
      } catch (err) {
        setError('Status check failed');
        clearInterval(interval);
      }
    }, 3000);
  };

  const fetchOutputs = async () => {
    try {
      const res = await axios.get(`/api/result/${jobId}`);
      setOutputs(res.data.outputs.outputs || []);
    } catch (err) {
      setError('Failed to fetch outputs');
    }
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div style={{ padding: 40 }}>
      <h1>WESKit Genomic Analysis</h1>
      <div {...getRootProps()} style={{ border: '2px dashed #888', padding: 40, marginBottom: 20 }}>
        <input {...getInputProps()} />
        <p>Drag & drop a .tar.gz file here, or click to select</p>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {jobId && <p>Job ID: {jobId}</p>}
      {weskitJobId && <p>WESKit Job ID: {weskitJobId}</p>}
      {jobId && status === 'uploaded' && (
        <button onClick={startPipeline}>Start Analysis</button>
      )}
      {status && <p>Status: {status}</p>}
      {outputs.length > 0 && (
        <div>
          <h3>Results</h3>
          <ul>
            {outputs.map((output, idx) => (
              <li key={idx}>
                <a href={output.url || output.path} target="_blank" rel="noopener noreferrer">
                  {output.name || output.url || output.path}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
