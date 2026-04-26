import * as React from 'react';
import { $$ } from 'frontend';
import { ListFiles } from '../ListFiles';
import './index.css';

type ScanPhase = 'idle' | 'scanning' | 'done' | 'error';

export function Music() {
  const server = $$.getCurrentServerOrNull();
  const [scanPhase, setScanPhase] = React.useState<ScanPhase>('idle');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  if (!server) {
    return null;
  }

  function handleScan() {
    if (!server || scanPhase === 'scanning') {
      return;
    }
    setScanPhase('scanning');
    setStatusMessage(null);
    fetch(`${server.url}/music/music-index/scan`, { method: 'POST' })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((text) => {
            setScanPhase('error');
            setStatusMessage(text || 'Scan failed.');
          });
        }
        return res.json().then((index: { tracks: unknown[] }) => {
          setScanPhase('done');
          setStatusMessage(`Found ${index.tracks.length} tracks.`);
        });
      })
      .catch(() => {
        setScanPhase('error');
        setStatusMessage('Could not connect to the server.');
      });
  }

  return (
    <div className="music">
      <div className="musicToolbar">
        <button
          type="button"
          className="button"
          onClick={handleScan}
          disabled={scanPhase === 'scanning'}
        >
          {scanPhase === 'scanning' ? 'Scanning…' : 'Scan Library'}
        </button>
        {statusMessage ? (
          <span className={`musicScanStatus musicScanStatus-${scanPhase}`}>
            {statusMessage}
          </span>
        ) : null}
      </div>
      <ListFiles />
    </div>
  );
}
