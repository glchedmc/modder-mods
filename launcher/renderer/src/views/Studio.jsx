import { useEffect, useRef, useState } from 'react';
import Icon from '../icons';
import { api, on } from '../api';
import { ModIcon } from '../components/ui';

export const STEPS = ['Get source', 'Analyze', 'Port with Grok', 'Build', 'Install'];

function Steps({ job }) {
  return (
    <div className="steps">
      {STEPS.map((s, i) => {
        const cls = job.state === 'failed' && i === job.step ? 'failed' : i < job.step || job.state === 'done' ? 'done' : i === job.step ? 'active' : '';
        return (
          <div key={s} className={`step ${cls}`}>
            <div className="bubble">{cls === 'done' ? <Icon name="check" size={15} stroke={2.4} /> : cls === 'failed' ? <Icon name="x" size={14} /> : i + 1}</div>
            <span>{s}{i === 3 && job.attempt > 1 && job.step === 3 ? ` · try ${job.attempt}/${job.maxAttempts}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Studio({ app }) {
  const [jobs, setJobs] = useState([]);
  const [sel, setSel] = useState(app.params.job || null);
  const consoleRef = useRef();
  useEffect(() => {
    api.listJobs().then((j) => { setJobs(j); if (!sel && j[0]) setSel(j[0].id); });
    return on('grok:job', (job) => setJobs((prev) => { const i = prev.findIndex((x) => x.id === job.id); if (i === -1) return [job, ...prev]; const n = prev.slice(); n[i] = job; return n; }));
  }, []);
  const job = jobs.find((j) => j.id === sel) || jobs[0];
  useEffect(() => { if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [job && job.log.length]);
  const elapsed = job ? Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000) : 0;

  return (
    <div className="view-enter">
      {!app.secrets.xaiApiKey && (
        <div className="upgrade-card glass" style={{ marginBottom: 16 }}>
          <div className="orb"><Icon name="key" size={20} /></div>
          <div style={{ flex: 1 }}><h4 style={{ margin: 0 }}>Add your xAI key in Settings</h4><div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Grok Studio uses the xAI API (grok-4.7). Your key is stored in the macOS Keychain.</div></div>
          <button className="btn primary" onClick={() => app.go('settings', { section: 'keys' })}>Add Key</button>
        </div>
      )}
      <div className="studio">
        <div className="glass" style={{ padding: 8, borderRadius: 22, alignSelf: 'start' }}>
          <div className="nav-label" style={{ paddingTop: 6 }}>Upgrades</div>
          {jobs.map((j) => (
            <div key={j.id} className={`job ${job && job.id === j.id ? 'on' : ''}`} onClick={() => setSel(j.id)}>
              <ModIcon title={j.title} src={j.icon} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b className="truncate" style={{ display: 'block' }}>{j.title}</b>
                <span className="faint" style={{ fontSize: 12 }}>{j.from} → {j.to}</span>
              </div>
              {j.state === 'running' ? <span className="activity" style={{ padding: 0, minWidth: 0 }}><span className="spinner" /></span>
                : j.state === 'done' ? <span className="pill green"><Icon name="check" size={11} />Done</span>
                  : <span className="pill red">{j.state === 'cancelled' ? 'Stopped' : 'Failed'}</span>}
            </div>
          ))}
          {jobs.length === 0 && <div className="empty" style={{ padding: 24 }}>No upgrades yet. Find a mod without a 26.3 build and press <b>Upgrade to 26.3</b>.</div>}
        </div>

        {job && (
          <div className="glass" style={{ padding: '20px 22px', borderRadius: 24 }}>
            <div className="row between">
              <div className="row" style={{ gap: 14 }}>
                <ModIcon title={job.title} src={job.icon} size={52} />
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.02em' }}>{job.title}</h2>
                  <div className="row" style={{ gap: 6, marginTop: 5 }}>
                    <span className="pill">{job.from}</span><Icon name="chevron" size={14} className="faint" /><span className="pill violet">{job.to}</span>
                    <span className="faint" style={{ fontSize: 12, marginLeft: 6 }}>{job.sourceKind}</span>
                  </div>
                </div>
              </div>
              <div className="row">
                <span className="faint" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}><Icon name="clock" size={13} style={{ verticalAlign: -2 }} /> {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
                {job.state === 'running' && <button className="btn sm" onClick={() => api.cancelJob(job.id)}>Stop</button>}
                {job.state === 'failed' && <button className="btn grok sm" onClick={() => app.startPort(app.instances.find((i) => i.id === job.instanceId), job)}><Icon name="refresh" size={14} />Retry</button>}
              </div>
            </div>
            <Steps job={job} />
            <div className="row between" style={{ margin: '4px 2px 8px' }}>
              <span className="group-title" style={{ margin: 0 }}><Icon name="terminal" size={14} />Live log</span>
              <span className="faint" style={{ fontSize: 12 }}>Model: {app.settings.grokModel} · reasoning {app.settings.grokReasoning}</span>
            </div>
            <div className="console" ref={consoleRef}>
              {job.log.map(([kind, text], i) => (
                <div key={i}><span className="t">{String(i + 1).padStart(3, '0')}</span><span className={kind}>{text}</span></div>
              ))}
              {job.state === 'running' && <div><span className="t">···</span><span className="grok">▍</span></div>}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Grok reads the mod's source (its GitHub repo when linked, otherwise a decompile of the jar), ports it to official Mojang names on Fabric Loader 0.20.1 / Fabric API 0.165.2+26.3, builds it with Gradle 9.8.2 and Java 25, and feeds compiler errors back until it builds. Ported jars are tagged <span className="kbd">+grok</span>, and the original license still applies.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
