import { useCallback, useEffect, useState } from 'react';
import Icon from '../icons';
import { api, on } from '../api';
import { LOADER_META, Sheet } from '../components/ui';

const PROVIDER_ICONS = { p2p: 'peers', tailscale: 'mesh', direct: 'router', e4mc: 'bolt' };
const STATE_LABEL = {
  preparing: ['Preparing', 'amber'], 'waiting-reply': ['Waiting for reply', 'amber'], 'waiting-host': ['Waiting for host', 'amber'],
  connecting: ['Connecting', 'amber'], connected: ['Connected', 'green'], reconnecting: ['Reconnecting', 'amber'], failed: ['Blocked', 'red'], closed: ['Closed', ''],
};

function useCopy(app) {
  return (t, what = 'Copied') => {
    const done = () => app.toast(what, 'ok');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(() => api.copyText(t).then(done));
    else api.copyText(t).then(done);
  };
}

function CodeBox({ code, onCopy, label }) {
  return (
    <div className="code-box" title="Click to copy" onClick={() => onCopy(code)}>
      <code>{code}</code>
      <button className="btn sm primary"><Icon name="copy" size={13} />{label || 'Copy'}</button>
    </div>
  );
}

function NatNotice({ nat }) {
  if (!nat) return null;
  const bad = nat.type === 'symmetric' || nat.type === 'blocked';
  return (
    <div className={`notice ${bad ? 'amber' : 'green'} glass flat`} title={`Network type: ${nat.type}`}>
      <Icon name={bad ? 'info' : 'check'} size={16} />
      <div><b>{bad ? 'Strict network' : 'Network looks good'}.</b> {nat.message}</div>
    </div>
  );
}

function SessionRow({ s, onClose, onCopy }) {
  const [label, tone] = STATE_LABEL[s.state] || [s.state, ''];
  return (
    <div className="p2p-session">
      <div className="p2p-avatar"><Icon name={s.role === 'join' ? 'globe' : 'user'} size={16} /></div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="truncate">{s.role === 'join' ? `Joining ${s.peerName || 'a friend'}` : s.peerName ? `${s.peerName}` : 'Invite (not used yet)'}</b>
          <span className={`pill ${tone}`}><span className="dot" />{label}</span>
          {s.pair && <span className="pill" title="How the connection was made">{s.pair.label}</span>}
          {s.state === 'connected' && <span className={`pill ${s.voiceUp ? 'green' : ''}`} title="Simple Voice Chat tunnel"><Icon name="mic" size={11} />{s.voiceUp ? 'Voice' : 'No voice'}</span>}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
          {s.error || (s.role === 'join' && s.state === 'connected' ? <>In Minecraft: Multiplayer → Direct Connection → <b className="mono" onClick={() => onCopy(s.joinAddress)}>{s.joinAddress}</b></> : s.role === 'host' && s.state === 'connected' ? `${s.connections} game connection${s.connections === 1 ? '' : 's'} · ${(s.bytesIn / 1048576).toFixed(1)} MB in` : s.voiceNote || '')}
        </div>
      </div>
      <button className="btn ghost sm icon-btn" title="End this connection" onClick={onClose}><Icon name="x" size={14} /></button>
    </div>
  );
}

function P2PPanel({ app, inst, st, sessions, copy }) {
  const [busy, setBusy] = useState(null);
  const [reply, setReply] = useState('');
  const mine = sessions.filter((s) => s.role === 'host' && s.instanceId === inst.id);
  const pending = mine.find((s) => s.state === 'waiting-reply');
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { app.toast(e.message, 'error'); } setBusy(null); };
  const nat = (pending || mine[0] || {}).nat;
  const server = st.kind === 'server';
  return (
    <div className="host-panel glass">
      <div className="host-panel-head">
        <div className="host-orb"><Icon name="peers" size={26} /></div>
        <div className="grow">
          <h2>Direct (free)</h2>
          <div className="faint">Peer-to-peer like Essential: you and your friend swap two codes. No account, no port forwarding, voice chat included.</div>
        </div>
        <span className="pill green" title="Uses free STUN servers, no relay">Free</span>
      </div>
      <ol className="host-steps big">
        <li className={st.running && (server || st.lanPort) ? 'done' : ''}><Icon name={st.running && (server || st.lanPort) ? 'check' : 'play'} size={14} />
          {server ? <>Start the server{st.running ? ' (running)' : ''}</> : <>Launch, open a world, then Esc → <b>Open to LAN</b>{st.lanPort ? <span className="pill green" style={{ marginLeft: 8 }}>LAN port {st.lanPort}</span> : null}</>}
          {!st.running && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => run('launch', () => app.launch(inst))}><Icon name="play" size={13} />{server ? 'Start' : 'Launch'}</button>}
        </li>
        <li className={pending || mine.some((s) => s.state !== 'waiting-reply') ? 'done' : ''}><Icon name="link" size={14} />Create an invite code and send it to your friend (any chat app).
          {!pending && <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={busy === 'invite' || !st.p2pAvailable} title="One invite per friend" onClick={() => run('invite', () => api.p2pCreateInvite(inst.id))}>{busy === 'invite' ? <span className="spinner" /> : <Icon name="plus" size={13} />}{mine.length ? 'Invite another friend' : 'Create invite'}</button>}
        </li>
        <li><Icon name="peers" size={14} />Your friend opens <b>Host World → Join a friend</b> in Saturn Client, pastes it and sends back a reply code.</li>
        <li><Icon name="check" size={14} />Paste the reply here. They join with <b className="mono">localhost</b> in Direct Connection.</li>
      </ol>
      {pending && (
        <div className="p2p-exchange">
          <div className="form-label">Invite code for your friend</div>
          <CodeBox code={pending.code} onCopy={(c) => copy(c, 'Invite copied. Send it to your friend.')} label="Copy invite" />
          <div className="form-label" style={{ marginTop: 12 }}>Paste their reply code</div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow"><Icon name="key" size={14} /><input value={reply} placeholder="SATURN-REPLY-…" onChange={(e) => setReply(e.target.value)} /></div>
            <button className="btn primary" disabled={!reply.trim() || busy === 'accept'} onClick={() => run('accept', async () => { await api.p2pAcceptReply(pending.id, reply); setReply(''); })}>{busy === 'accept' ? <span className="spinner" /> : <Icon name="bolt" size={14} />}Connect</button>
          </div>
        </div>
      )}
      <NatNotice nat={nat} />
      {mine.length > 0 && <div className="p2p-sessions">{mine.map((s) => <SessionRow key={s.id} s={s} onCopy={copy} onClose={() => api.p2pClose(s.id)} />)}</div>}
      {mine.some((s) => s.state === 'failed') && (
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <span className="faint" style={{ fontSize: 12 }}>Direct is blocked between your networks. Try:</span>
          <button className="btn sm" onClick={() => app.saveSettings({ hostProvider: 'tailscale' })}><Icon name="mesh" size={13} />Tailscale</button>
          <button className="btn sm" onClick={() => app.saveSettings({ hostProvider: 'direct' })}><Icon name="router" size={13} />Own IP</button>
        </div>
      )}
    </div>
  );
}

function JoinSheet({ app, onClose, sessions, copy }) {
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(null);
  const s = sessions.find((x) => x.id === sid) || null;
  const join = async () => { setBusy(true); try { const r = await api.p2pJoin(invite); setSid(r.id); } catch (e) { app.toast(e.message, 'error'); } setBusy(false); };
  const [label, tone] = s ? STATE_LABEL[s.state] || [s.state, ''] : [];
  return (
    <Sheet onClose={onClose} width={620}>
      <h2><Icon name="peers" size={20} /> Join a friend</h2>
      <div className="muted">For Direct (free) hosting. Your friend sends an invite code; you send a reply code back.</div>
      {!s && <>
        <label className="form-label">Invite code</label>
        <textarea className="code-input" rows={4} value={invite} placeholder="SATURN-INVITE-…" onChange={(e) => setInvite(e.target.value)} />
        <div className="foot"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!invite.trim() || busy} onClick={join}>{busy ? <span className="spinner" /> : <Icon name="key" size={14} />}Make reply code</button></div>
      </>}
      {s && <>
        <div className="row" style={{ gap: 8, margin: '14px 0 6px' }}><b>{s.peerName || 'Friend'}'s world</b>{s.mcVersion && <span className="pill">{s.mcVersion}</span>}<span className={`pill ${tone}`}><span className="dot" />{label}</span>{s.pair && <span className="pill">{s.pair.label}</span>}</div>
        {s.state !== 'connected' && s.state !== 'failed' && <>
          <label className="form-label">Send this reply code back</label>
          <CodeBox code={s.code} onCopy={(c) => copy(c, 'Reply copied. Send it to your friend.')} label="Copy reply" />
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Keep this window open. It connects as soon as they paste it.</div>
        </>}
        {s.state === 'connected' && (
          <div className="join-ready">
            <div className="faint">In Minecraft: Multiplayer → Direct Connection → Server Address</div>
            <div className="host-address" onClick={() => copy(s.joinAddress)} title="Click to copy">{s.joinAddress}<Icon name="copy" size={18} /></div>
            <div className="faint" style={{ fontSize: 12 }}>{s.voiceNote || 'Voice chat comes through the same tunnel. Install Simple Voice Chat in your instance too.'}</div>
          </div>
        )}
        <NatNotice nat={s.nat} />
        {s.error && <div className="notice red glass flat"><Icon name="info" size={16} /><div>{s.error}</div></div>}
        <div className="foot"><button className="btn ghost" onClick={() => { api.p2pClose(s.id); onClose(); }}>Disconnect</button><button className="btn primary" onClick={onClose}>Done</button></div>
      </>}
    </Sheet>
  );
}

function TailscalePanel({ app, st, copy }) {
  const [ts, setTs] = useState(null);
  const load = () => api.tailscaleStatus().then(setTs).catch(() => setTs({ installed: false }));
  useEffect(() => { load(); }, []);
  const addr = ts && (ts.dnsName || ts.ip4);
  const join = addr ? (st.port && st.port !== 25565 ? `${addr}:${st.port}` : addr) : null;
  return (
    <div className="host-panel glass">
      <div className="host-panel-head">
        <div className="host-orb"><Icon name="mesh" size={26} /></div>
        <div className="grow"><h2>Tailscale</h2><div className="faint">A private network for you and your friends. Works through any router, voice chat included, no port forwarding.</div></div>
        <button className="btn sm ghost" title="Check again" onClick={load}><Icon name="refresh" size={13} /></button>
      </div>
      {!ts && <div className="faint">Checking for Tailscale…</div>}
      {ts && ts.running && (
        <div className="host-live">
          <div className="pill green"><span className="dot" />Connected{ts.tailnet ? ` · ${ts.tailnet}` : ''}</div>
          <div className="host-address" onClick={() => copy(join)} title="Click to copy">{join}<Icon name="copy" size={18} /></div>
          <div className="faint">Friends on your tailnet join with this address. {ts.ip4 && ts.dnsName ? <>IP: <span className="mono">{ts.ip4}</span>. </> : null}{ts.peersOnline} device{ts.peersOnline === 1 ? '' : 's'} online.</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn sm" title="Invite a friend to your tailnet" onClick={() => api.openUrl(ts.inviteUrl)}><Icon name="user" size={13} />Invite friend</button>
            <button className="btn sm" title="Share just this computer" onClick={() => api.openUrl(ts.shareUrl)}><Icon name="external" size={13} />Share this device</button>
          </div>
        </div>
      )}
      {ts && !ts.running && (
        <div>
          <div className={`notice ${ts.installed ? 'amber' : ''} glass flat`}><Icon name="info" size={16} /><div>{ts.installed ? (ts.needsLogin ? 'Tailscale is installed but not signed in.' : 'Tailscale is installed but not running. Start it, then check again.') : 'Tailscale is not installed on this computer.'}</div></div>
          <ol className="host-steps">{ts.install.steps.map((x, i) => <li key={i}><Icon name={i === 0 ? 'download' : i === 1 ? 'key' : 'user'} size={14} />{x}</li>)}</ol>
          {ts.install.command && <CodeBox code={ts.install.command} onCopy={(c) => copy(c, 'Command copied')} label="Copy command" />}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn primary sm" onClick={() => api.openUrl(ts.authUrl || ts.install.url)}><Icon name="external" size={13} />{ts.authUrl ? 'Sign in' : 'Get Tailscale'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectPanel({ app, inst, st, copy }) {
  const [netInfo, setNet] = useState(null);
  const [map, setMap] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ddns, setDdns] = useState(st.ddnsName || '');
  const [token, setToken] = useState('');
  const [manual, setManual] = useState(false);
  useEffect(() => { api.hostNetwork().then((n) => { setNet(n); if (n.upnp) setMap(n.upnp); }).catch(() => setNet({ lan: [] })); }, []);
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { app.toast(e.message, 'error'); } setBusy(null); };
  const host = st.ddnsName || (netInfo && netInfo.publicIp);
  const port = st.port || 25565;
  const join = host ? (port === 25565 ? host : `${host}:${port}`) : null;
  const lanIp = netInfo && netInfo.lan[0] ? netInfo.lan[0].address : null;
  const steps = (map && map.steps) || [
    'Open your router page (often http://192.168.1.1) and sign in.', 'Find Port Forwarding (NAT / Virtual Server / Gaming).',
    `Add TCP ${port} → ${lanIp || 'this computer'} (Minecraft).`, `Add UDP ${st.voice.port} → ${lanIp || 'this computer'} (voice chat).`, 'Save, then share the address above.',
  ];
  return (
    <div className="host-panel glass">
      <div className="host-panel-head">
        <div className="host-orb"><Icon name="router" size={26} /></div>
        <div className="grow"><h2>Own IP / port forward</h2><div className="faint">Friends connect straight to your internet address. Needs ports open on your router (UPnP can do it for you).</div></div>
      </div>
      <div className="ip-grid">
        <div className="ip-tile" title="Share this with friends" onClick={() => join && copy(join)}><span>Join address</span><b className="mono">{join || '…'}</b><Icon name="copy" size={14} /></div>
        <div className="ip-tile" title="Your internet address" onClick={() => netInfo && netInfo.publicIp && copy(netInfo.publicIp)}><span>Public IP</span><b className="mono">{netInfo ? netInfo.publicIp || 'Unknown' : '…'}</b></div>
        <div className="ip-tile" title="Same Wi-Fi friends use this" onClick={() => lanIp && copy(`${lanIp}${port === 25565 ? '' : `:${port}`}`)}><span>Local IP</span><b className="mono">{lanIp || '…'}</b></div>
      </div>
      {st.kind !== 'server' && <div className="faint" style={{ fontSize: 12, margin: '2px 0 10px' }}>In <b>Open to LAN</b>, set Port Number to <b>25565</b> so the forwarded port matches.</div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy === 'upnp'} title={`Map TCP ${port} and UDP ${st.voice.port} on your router`} onClick={() => run('upnp', async () => setMap(await api.upnpMap(inst.id)))}>{busy === 'upnp' ? <span className="spinner" /> : <Icon name="bolt" size={14} />}Open ports with UPnP</button>
        {map && map.ok && <button className="btn" onClick={() => run('unmap', async () => { await api.upnpUnmap(inst.id); setMap(null); app.toast('Ports closed', 'ok'); })}>Close ports</button>}
        <button className="btn ghost" onClick={() => setManual(!manual)}><Icon name="info" size={14} />{manual ? 'Hide router steps' : 'Set up manually'}</button>
      </div>
      {map && (
        <div className="upnp-result">
          {map.error && <div className="notice amber glass flat"><Icon name="info" size={16} /><div>{map.error}</div></div>}
          {map.mappings && map.mappings.map((m) => <div key={m.protocol} className="row" style={{ gap: 8 }}><span className={`pill ${m.ok ? 'green' : 'red'}`}><Icon name={m.ok ? 'check' : 'x'} size={11} />{m.protocol} {m.port}</span><span className="faint" style={{ fontSize: 12 }}>{m.what}{m.error ? `: ${m.error}` : ' forwarded'}</span></div>)}
          {map.warning && <div className="notice red glass flat"><Icon name="info" size={16} /><div>{map.warning}</div></div>}
        </div>
      )}
      {(manual || (map && map.steps)) && <ol className="host-steps router-steps">{steps.map((x, i) => <li key={i}><span className="step-n">{i + 1}</span>{x}</li>)}</ol>}
      <div className="group-title" style={{ marginTop: 14 }}>Dynamic DNS (optional)</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="field" style={{ width: 260 }} title="A name that follows your IP, like DuckDNS"><Icon name="globe" size={14} /><input value={ddns} placeholder="myworld.duckdns.org" onChange={(e) => setDdns(e.target.value)} /></div>
        <button className="btn sm" onClick={() => run('ddns', async () => { const r = await api.setDdnsName(ddns); setDdns(r.ddnsName); app.refresh(); app.toast(r.ddnsName ? 'Name saved' : 'Name cleared', 'ok'); })}>Save</button>
        {/duckdns\.org$/i.test(st.ddnsName || '') && <>
          {!app.secrets.duckdnsToken ? <><div className="field" style={{ width: 220 }}><Icon name="key" size={14} /><input type="password" value={token} placeholder="DuckDNS token" onChange={(e) => setToken(e.target.value)} /></div>
            <button className="btn sm" disabled={!token} onClick={() => run('tok', async () => { await app.setSecret('duckdnsToken', token); setToken(''); })}>Save token</button></>
            : <button className="btn sm" title="Point the name at your current IP" onClick={() => run('upd', async () => { await api.updateDdns(); app.toast('DuckDNS updated', 'ok'); })}><Icon name="refresh" size={13} />Update now</button>}
        </>}
      </div>
    </div>
  );
}

function E4mcPanel({ app, inst, st, copy }) {
  const [busy, setBusy] = useState(false);
  if (st.kind === 'server') return <div className="host-panel glass"><div className="notice amber glass flat"><Icon name="info" size={16} /><div>e4mc is a client mod for singleplayer worlds. For this server use Direct, Tailscale or your own IP.</div></div></div>;
  return (
    <div className={`host-panel glass ${st.address ? 'live' : ''}`}>
      <div className="host-panel-head">
        <div className="host-orb"><Icon name="bolt" size={26} /></div>
        <div className="grow"><h2>e4mc quick link</h2><div className="faint">Instant public address for your LAN world. Friends need nothing installed. <b>No voice chat</b> (it only carries the game).</div></div>
        <span className="pill red" title="Simple Voice Chat cannot pass through e4mc"><Icon name="mic" size={11} />No voice</span>
      </div>
      {st.address ? (
        <div className="host-live">
          <div className="pill green"><span className="dot" />Live</div>
          <div className="host-address" onClick={() => copy(st.address)} title="Click to copy">{st.address}<Icon name="copy" size={18} /></div>
          <div className="faint">Friends: Multiplayer → Direct Connection → paste this address.</div>
        </div>
      ) : (
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <ol className="host-steps">
            <li className={st.e4mcInstalled ? 'done' : ''}><Icon name={st.e4mcInstalled ? 'check' : 'download'} size={14} />e4mc installed{!st.e4mcInstalled && ' (added for you)'}</li>
            <li className={st.running ? 'done' : ''}><Icon name={st.running ? 'check' : 'play'} size={14} />Launch and open a world</li>
            <li><Icon name="wifi" size={14} />Esc → <b>Open to LAN</b> → Start LAN World</li>
            <li><Icon name="link" size={14} />The address shows up here</li>
          </ol>
          <button className="play-btn" disabled={busy} onClick={async () => { setBusy(true); try { await api.hostWorld(inst.id); } catch (e) { app.toast(e.message, 'error'); } setBusy(false); }}>{busy ? <span className="spinner" /> : <Icon name="play" size={18} />}{st.running ? 'Waiting for LAN…' : 'Host world'}</button>
        </div>
      )}
    </div>
  );
}

const VOICE_LINE = {
  p2p: 'Voice goes through the same Direct tunnel (UDP channel). voice_host stays blank so friends use their tunnel.',
  tailscale: 'Voice works over Tailscale. voice_host is set to your Tailscale address.',
  direct: 'Forward UDP voice too. voice_host is set to your public IP or DNS name.',
  e4mc: 'e4mc cannot carry voice. Only friends on your Wi-Fi get voice chat.',
};

function VoicePanel({ app, inst, st, provider, reload }) {
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState(null);
  const [last, setLast] = useState(null);
  useEffect(() => { api.micStatus().then(setMic).catch(() => {}); }, []);
  const enable = async () => {
    setBusy(true);
    try { const r = await api.enableVoiceChat(inst.id, provider); setLast(r); reload(r.status); app.refresh(); app.toast(r.installed ? 'Simple Voice Chat installed and set up' : 'Voice chat set up', 'ok'); } catch (e) { app.toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <>
      <div className="group-title"><Icon name="mic" size={13} />Voice chat</div>
      <div className="group glass">
        <div className="setting"><div className="label"><b>Simple Voice Chat</b><span>{VOICE_LINE[provider]}</span></div>
          {st.voiceChatInstalled && <span className="pill green" title="Installed in this instance"><Icon name="check" size={11} />Installed</span>}
          <button className={`btn sm ${st.voiceChatInstalled ? '' : 'primary'}`} disabled={busy || provider === 'e4mc'} title={provider === 'e4mc' ? 'Pick another provider for voice' : 'Install the 26.3 build and set voice_host'} onClick={enable}>{busy ? <span className="spinner" /> : <Icon name="mic" size={14} />}{st.voiceChatInstalled ? 'Update voice setup' : 'Enable voice chat'}</button></div>
        <div className="setting"><div className="label"><b>voice_host</b><span className="mono">{st.voice.configured ? (st.voice.voiceHost || '(blank: the address players joined with)') : 'Not set up yet'} · UDP {st.voice.port}</span></div>
          <span className="faint mono" style={{ fontSize: 11 }} title="Simple Voice Chat config file">{st.voice.file}</span></div>
        {last && last.note && <div className="setting"><div className="label"><b>Done</b><span>{last.note}</span></div></div>}
        <div className="setting"><div className="label"><b>Microphone</b><span>{mic ? mic.hint : 'Checking…'}</span></div>
          {mic && <span className={`pill ${mic.tone}`} title="Mic access for Saturn Client and the game"><Icon name="mic" size={11} />{mic.label}</span>}
          {mic && mic.canPrompt && <button className="btn sm" onClick={async () => setMic(await api.requestMic())}>Allow</button>}
          {mic && mic.soundSettings && <button className="btn sm" onClick={() => api.openMicSettings()}>Sound settings</button>}</div>
        <div className="setting"><div className="label"><b>Friends</b><span>Everyone installs Simple Voice Chat too (one click in their Saturn Client). Push-to-talk defaults to Caps Lock.</span></div></div>
      </div>
    </>
  );
}

export default function Host({ app }) {
  const [id, setId] = useState(app.params.id || (app.selected && app.selected.id));
  const inst = app.instances.find((i) => i.id === id) || app.selected;
  const [st, setSt] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [joining, setJoining] = useState(app.params.join === '1');
  const copy = useCopy(app);
  const load = useCallback(() => { if (inst) api.hostStatus(inst.id).then(setSt).catch(() => {}); }, [inst && inst.id]);
  useEffect(() => { load(); api.p2pList().then(setSessions).catch(() => {}); }, [load, app.settings.hostProvider]);
  useEffect(() => on('host:update', (u) => { if (inst && u.id === inst.id) load(); }), [load]);
  useEffect(() => on('launch:state', () => load()), [load]);
  useEffect(() => on('p2p:update', setSessions), []);
  if (!inst) return <div className="empty">Create an instance first.</div>;
  const provider = (st && st.provider) || app.settings.hostProvider || 'p2p';
  const providers = (st && st.providers) || [];

  return (
    <div className="view-enter host-layout">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="field" style={{ width: 300 }}><Icon name="cube" size={15} />
          <select value={inst.id} onChange={(e) => setId(e.target.value)}>{app.instances.map((i) => <option key={i.id} value={i.id}>{i.name} · {(LOADER_META[i.loader] || { label: i.loader }).label} {i.mcVersion}</option>)}</select></div>
        <button className="btn" title="Paste a friend's invite code" onClick={() => setJoining(true)}><Icon name="peers" size={15} />Join a friend</button>
      </div>

      {st && !st.ok && <div className="notice amber glass flat"><Icon name="info" size={16} /><div>{st.reason}</div></div>}

      {st && st.ok && <>
        <div className="provider-grid">
          {providers.map((p) => (
            <button key={p.id} className={`provider-card glass ${provider === p.id ? 'on' : ''}`} title={p.blurb} onClick={() => app.saveSettings({ hostProvider: p.id })}>
              <div className="pc-top"><Icon name={PROVIDER_ICONS[p.id]} size={20} />{p.recommended && <span className="pill green">Recommended</span>}{!p.voice && <span className="pill red">No voice</span>}</div>
              <b>{p.label}</b>
              <span>{p.blurb}</span>
            </button>
          ))}
        </div>
        {provider === 'p2p' && <P2PPanel app={app} inst={inst} st={st} sessions={sessions} copy={copy} />}
        {provider === 'tailscale' && <TailscalePanel app={app} st={st} copy={copy} />}
        {provider === 'direct' && <DirectPanel app={app} inst={inst} st={st} copy={copy} />}
        {provider === 'e4mc' && <E4mcPanel app={app} inst={inst} st={st} copy={copy} />}
        <VoicePanel app={app} inst={inst} st={st} provider={provider} reload={(s) => (s ? setSt(s) : load())} />
      </>}
      {joining && <JoinSheet app={app} sessions={sessions} copy={copy} onClose={() => setJoining(false)} />}
    </div>
  );
}
