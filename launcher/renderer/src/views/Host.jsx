import { useCallback, useEffect, useState } from 'react';
import Icon from '../icons';
import { api, on } from '../api';
import { LOADER_META } from '../components/ui';

export default function Host({ app }) {
  const [id, setId] = useState(app.params.id || (app.selected && app.selected.id));
  const inst = app.instances.find((i) => i.id === id) || app.selected;
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [mic, setMic] = useState(null);
  const load = useCallback(() => { if (inst) api.hostStatus(inst.id).then(setSt).catch(() => {}); }, [inst && inst.id]);
  useEffect(() => { load(); api.micStatus().then(setMic).catch(() => {}); }, [load]);
  useEffect(() => on('host:update', (u) => { if (inst && u.id === inst.id) load(); }), [load]);
  useEffect(() => on('launch:state', () => load()), [load]);
  if (!inst) return <div className="empty">Create an instance first.</div>;

  const copy = (t) => { navigator.clipboard.writeText(t).then(() => app.toast('Copied', 'ok')).catch(() => {}); };
  const run = async (key, fn) => { setBusy(key); try { const r = await fn(); if (r && r.status) setSt(r.status); else if (r && 'ok' in r) setSt(r); else load(); app.refresh(); } catch (e) { app.toast(e.message, 'error'); } setBusy(null); };
  const server = st && st.kind === 'server';

  return (
    <div className="view-enter host-layout">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="field" style={{ width: 300 }}><Icon name="cube" size={15} />
          <select value={inst.id} onChange={(e) => setId(e.target.value)}>{app.instances.map((i) => <option key={i.id} value={i.id}>{i.name} · {LOADER_META[i.loader].label} {i.mcVersion}</option>)}</select></div>
        <span className="faint" style={{ fontSize: 12 }}>Powered by <a onClick={() => api.openUrl('https://modrinth.com/mod/e4mc')} style={{ color: 'var(--accent)' }}>e4mc</a>: no port forwarding</span>
      </div>

      {st && !st.ok && <div className="notice amber glass flat"><Icon name="info" size={16} /><div>{st.reason}</div></div>}

      {st && st.ok && !server && (
        <div className={`host-hero glass ${st.address ? 'live' : ''}`}>
          <div className="host-orb"><Icon name="globe" size={30} /></div>
          {st.address ? (
            <div className="grow">
              <div className="pill green"><span className="dot" />Live</div>
              <div className="host-address" onClick={() => copy(st.address)} title="Click to copy">{st.address}<Icon name="copy" size={18} /></div>
              <div className="faint">Friends: Multiplayer → Direct Connection → paste this address. Stays up while the world is open.</div>
            </div>
          ) : (
            <div className="grow">
              <h2>Host {inst.name}</h2>
              <ol className="host-steps">
                <li className={st.e4mcInstalled ? 'done' : ''}><Icon name={st.e4mcInstalled ? 'check' : 'download'} size={14} />e4mc installed{!st.e4mcInstalled && ' (added for you)'}</li>
                <li className={st.running ? 'done' : ''}><Icon name={st.running ? 'check' : 'play'} size={14} />Launch and open a world</li>
                <li><Icon name="wifi" size={14} />Esc → <b>Open to LAN</b> → Start LAN World</li>
                <li><Icon name="link" size={14} />Your join address shows up here</li>
              </ol>
            </div>
          )}
          {!st.address && (
            <button className="play-btn" disabled={busy === 'host'} onClick={() => run('host', () => api.hostWorld(inst.id))}>
              {busy === 'host' ? <span className="spinner" /> : <Icon name="play" size={18} />}{st.running ? 'Waiting for LAN…' : 'Host world'}
            </button>
          )}
        </div>
      )}

      {st && st.ok && server && (
        <div className="host-hero glass">
          <div className="host-orb"><Icon name="server" size={28} /></div>
          <div className="grow">
            <h2>{inst.name} server</h2>
            <div className="faint" style={{ marginBottom: 8 }}>Same Wi-Fi: join with one of these. Friends elsewhere need port {st.port} forwarded on your router, or a tunnel such as playit.gg.</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{st.lan.map((a) => <button key={a.address} className="chip" onClick={() => copy(`${a.address}:${st.port}`)}><Icon name="copy" size={13} />{a.address}:{st.port}</button>)}</div>
          </div>
          <button className="play-btn" onClick={() => app.launch(inst)}><Icon name="play" size={18} />{st.running ? 'Running' : 'Start server'}</button>
        </div>
      )}

      <div className="group-title">Voice chat</div>
      <div className="group glass">
        <div className="setting"><div className="label"><b>Simple Voice Chat</b><span>Proximity voice. Everyone needs it; the host's world runs the voice server.</span></div>
          {st && st.voiceChatInstalled ? <span className="pill green"><Icon name="check" size={11} />Installed</span> : <button className="btn sm" disabled={busy === 'svc' || !st || !st.ok} onClick={() => run('svc', () => api.installHostingMod(inst.id, 'voicechat'))}>{busy === 'svc' ? <span className="spinner" /> : <Icon name="download" size={14} />}Install</button>}</div>
        <div className="setting"><div className="label"><b>Microphone</b><span>{mic ? mic.hint : 'Checking…'}</span></div>
          {mic && <span className={`pill ${mic.tone}`} title="macOS permission for Saturn Client and the game"><Icon name="mic" size={11} />{mic.label}</span>}
          {mic && mic.status !== 'granted' && <button className="btn sm" onClick={async () => setMic(await api.requestMic())}>Allow</button>}</div>
        <div className="setting"><div className="label"><b>Over e4mc</b><span>e4mc tunnels the game, not voice chat's UDP port. LAN friends get voice; for remote voice use a server with UDP 24454 open.</span></div></div>
      </div>
    </div>
  );
}
