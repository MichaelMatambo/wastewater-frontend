import React, { useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import shp from 'shpjs';

export default function ShapefileUploader({ onUploadComplete, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  const inputRef = useRef();

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f && f.name.endsWith('.zip')) {
      setFile(f);
      setStatus('');
      setStats(null);
    } else {
      setFile(null);
      setStatus('Please select a .zip file containing your shapefile.');
      setStatusType('err');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.zip')) {
      setFile(f);
      setStatus('');
      setStats(null);
    }
  };

  const handleUpload = async () => {
    if (!file) { setStatus('Please select a file first.'); setStatusType('err'); return; }
    setUploading(true);
    setProgress(5);
    setStatus('Reading shapefile archive…');
    setStatusType('info');

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          setProgress(20);
          const geojson = await shp(e.target.result);
          const features = geojson.features;
          setProgress(35);
          setStatus(`Processing ${features.length} features…`);

          let manholesAdded = 0, pipelinesAdded = 0, errors = 0;

          for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const pct = 35 + Math.round((i / features.length) * 55);
            setProgress(pct);

            if (feature.geometry.type === 'Point') {
              const { error } = await supabase.from('waste_water_manhole').insert([{
                geom: feature.geometry,
                status: feature.properties.status || 'Good',
                manhole_id: feature.properties.id || `MH_${Date.now()}_${manholesAdded}`,
                created_at: new Date().toISOString(),
              }]);
              if (!error) manholesAdded++; else errors++;
            } else if (feature.geometry.type === 'LineString') {
              const { error } = await supabase.from('waste_water_pipeline').insert([{
                geom: feature.geometry,
                status: feature.properties.status || 'Good',
                pipe_id: feature.properties.id || `PL_${Date.now()}_${pipelinesAdded}`,
                pipe_mat: feature.properties.material || 'Unknown',
                length: feature.properties.length || 0,
                created_at: new Date().toISOString(),
              }]);
              if (!error) pipelinesAdded++; else errors++;
            }
          }

          setProgress(100);
          setStats({ manholes: manholesAdded, pipelines: pipelinesAdded, errors });
          setStatus(`Upload complete — ${manholesAdded + pipelinesAdded} features imported.`);
          setStatusType('ok');
          onUploadComplete();
        } catch (err) {
          setStatus(`Processing failed: ${err.message}`);
          setStatusType('err');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      setStatusType('err');
      setUploading(false);
    }
  };

  return (
    <div className="eng-panel" style={{ '--panel-color-bg': 'rgba(34,197,94,0.1)', '--panel-color-border': 'rgba(34,197,94,0.3)' }}>
      <div className="eng-panel-header">
        <div className="eng-panel-header-icon">📤</div>
        <div>
          <div className="eng-panel-title">Upload Shapefile</div>
          <div className="eng-panel-sub">ZIP archive — Point &amp; LineString features</div>
        </div>
        <button className="eng-panel-close" onClick={onClose}>×</button>
      </div>

      <div className="eng-panel-body">
        {/* Drop Zone */}
        <div
          className={`eng-drop-zone${file ? ' has-file' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <div className="dz-icon">{file ? '✅' : '📁'}</div>
          <div className="dz-text">
            {file ? file.name : 'Drop .zip shapefile here'}
          </div>
          <div className="dz-sub">
            {file
              ? `${(file.size / 1024).toFixed(1)} KB — click to change`
              : 'or click to browse files'}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </div>

        {/* Format guide */}
        <div className="eng-section-head">Supported Formats</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { icon: '🕳️', label: 'Point → Manholes', desc: '.shp Point geometry' },
            { icon: '📏', label: 'Line → Pipelines', desc: '.shp LineString geometry' },
          ].map(f => (
            <div key={f.label} style={{
              padding: '10px 12px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-pri)' }}>{f.label}</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Progress */}
        {uploading && (
          <>
            <div className="eng-progress-wrap">
              <div className="eng-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-sec)', marginBottom: 8 }}>
              {progress}% — {status}
            </div>
          </>
        )}

        {/* Status */}
        {status && !uploading && (
          <div className={`eng-status ${statusType}`}>{status}</div>
        )}

        {/* Stats */}
        {stats && (
          <>
            <div className="eng-section-head">Import Summary</div>
            <div className="eng-info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="eng-stat-card blue">
                <div className="sc-num">{stats.manholes}</div>
                <div className="sc-label">Manholes</div>
              </div>
              <div className="eng-stat-card green">
                <div className="sc-num">{stats.pipelines}</div>
                <div className="sc-label">Pipelines</div>
              </div>
              <div className={`eng-stat-card ${stats.errors > 0 ? 'red' : 'green'}`}>
                <div className="sc-num">{stats.errors}</div>
                <div className="sc-label">Errors</div>
              </div>
            </div>
          </>
        )}

        <div className="eng-btn-row">
          <button className="eng-btn eng-btn-ghost" onClick={onClose} disabled={uploading}>
            Close
          </button>
          <button
            className="eng-btn eng-btn-success"
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? `⏳ Uploading… ${progress}%` : '⬆ Import Shapefile'}
          </button>
        </div>
      </div>
    </div>
  );
}
