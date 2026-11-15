import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons';
import { api, on } from '../api';
import { Sheet, Segmented, LOADER_META } from '../components/ui';

const STATE = {
  hosting: ['Hosting', 'green'], playing: ['In game', 'blue'], online: ['Online', 'green'], offline: ['Offline', ''],
};
const hueOf = (pk) => parseInt(String(pk).slice(0, 6), 16) % 360;

export function Avatar({ pk, name, size = 36, state }) {
  const h = hueOf(pk);
  return (
    <div className="f-avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${h} 70% 62%), hsl(${(h + 50) % 360} 70% 48%))` }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
      {state && <i className={`f-dot ${state}`} />}
    </div>
  );
}

function ago(at) {
  if (!at) return '';
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function statusLine(f, worlds) {
  const p = f.presence || { state: 'offline' };
  if (p.state === 'hosting') {
    const w = worlds.shared.find((x) => x.host === f.pubkey && x.live);
    return w ? `Hosting ${w.name}` : 'Hosting a world';
  }
  if (p.state === 'playing') return p.instance ? `Playing ${p.instance.name} · ${p.instance.mcVersion}` : 'In game';
  if (p.state === 'online') return 'Online';
  return p.lastSeen ? `Last seen ${ago(p.lastSeen)} ago` : 'Offline';
}

function useCopy(app) {
  return useCallback(async (text, msg = 'Copied') => {
    try { await api.copyText(text); } catch { try { await navigator.clipboard.writeText(text); } catch { /* */ } }
    app.toast(msg, 'ok');
  }, [app]);
}

// ---------------- Add friend ----------------
function AddFriendSheet({ app, me, onClose }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const copy = useCopy(app);
  useEffect(() => { api.socialQr().then(setQr).catch(() => {}); }, []);
  const find = async () => { setBusy(true); setFound(null); try { setFound(await api.socialFind(q)); } catch (e) { app.toast(e.message, 'error'); } setBusy(false); };
  const send = async () => { setBusy(true); try { await api.socialAddFriend(found.pubkey || q); app.toast(`Request sent to ${found.name || found.code}`, 'ok'); onClose(); } catch (e) { app.toast(e.message, 'error'); } setBusy(false); };
  return (
    <Sheet onClose={onClose} width={640}>
      <h2><Icon name="userPlus" size={20} /> Add a friend</h2>
      <div className="muted">Swap friend codes. They get a request and accept it in Saturn.</div>
      <div className="add-grid">
        <div>
          <label className="form-label">Their friend code</label>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow"><Icon name="user" size={14} /><input autoFocus value={q} placeholder="SAT-XXXX-XXXX or npub…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && find()} /></div>
            <button className="btn" disabled={!q.trim() || busy} onClick={find}>{busy && !found ? <span className="spinner" /> : <Icon name="search" size={14} />}Find</button>
          </div>
          {found && (
            <div className="found-card">
              <Avatar pk={found.pubkey} name={found.name || '?'} size={44} />
              <div className="grow" style={{ minWidth: 0 }}><b>{found.name || 'Saturn player'}</b><div className="faint mono" style={{ fontSize: 11 }}>{found.code}</div></div>
              <button className="btn primary" disabled={busy} onClick={send}><Icon name="userPlus" size={14} />Send request</button>
            </div>
          )}
          <div className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>Check the name matches before sending. Codes are short, so you can also paste their full npub.</div>
        </div>
        <div className="my-code">
          <label className="form-label">Your code</label>
          <button className="code-chip big" title="Copy your friend code" onClick={() => copy(me.code, 'Friend code copied')}>{me.code}<Icon name="copy" size={15} /></button>
          {qr && <img className="qr" src={qr} alt="QR code of your npub" title="Scan with a Nostr app" />}
          <button className="btn sm ghost" title="Copy your full public key" onClick={() => copy(me.npub, 'npub copied')}><Icon name="key" size={13} />Copy npub</button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------- Worlds ----------------
function WorldSheet({ app, world, friends, onClose }) {
  const clientInstances = app.instances;
  const [name, setName] = useState(world ? world.name : '');
  const [instanceId, setInstanceId] = useState(world ? world.instanceId : (app.selected && app.selected.id) || (clientInstances[0] && clientInstances[0].id));
  const [members, setMembers] = useState(world ? world.members : []);
  const [busy, setBusy] = useState(false);
  const inst = clientInstances.find((i) => i.id === instanceId);
  const save = async () => {
    setBusy(true);
    try { await api.socialSaveWorld({ id: world && world.id, instanceId, name: name.trim() || (inst && inst.name) || 'My world', members }); app.toast(world ? 'World updated' : 'World shared with members', 'ok'); onClose(); } catch (e) { app.toast(e.message, 'error'); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} width={560}>
      <h2><Icon name="globe" size={20} /> {world ? 'Edit world' : 'Share a world'}</h2>
      <div className="muted">Members see it in Friends and join with one click while you host it.</div>
      <label className="form-label">Name</label>
      <div className="field"><Icon name="text" size={14} /><input value={name} maxLength={60} placeholder={inst ? inst.name : 'My world'} onChange={(e) => setName(e.target.value)} /></div>
      <label className="form-label">Instance</label>
      <div className="field"><Icon name="cube" size={14} /><select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>{clientInstances.map((i) => <option key={i.id} value={i.id}>{i.name} · {(LOADER_META[i.loader] || { label: i.loader }).label} {i.mcVersion}</option>)}</select></div>
      <label className="form-label">Members</label>
      <div className="member-pick">
        {friends.length === 0 && <div className="faint">Add friends first.</div>}
        {friends.map((f) => (
          <label key={f.pubkey} className={`member-opt ${members.includes(f.pubkey) ? 'on' : ''}`}>
            <input type="checkbox" checked={members.includes(f.pubkey)} onChange={(e) => setMembers(e.target.checked ? [...members, f.pubkey] : members.filter((m) => m !== f.pubkey))} />
            <Avatar pk={f.pubkey} name={f.name} size={26} /><span>{f.name || f.code}</span>
          </label>
        ))}
      </div>
      <div className="foot">
        {world && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={async () => { await api.socialRemoveWorld(world.id); onClose(); }}><Icon name="trash" size={14} />Stop sharing</button>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !instanceId} onClick={save}><Icon name="check" size={14} />{world ? 'Save' : 'Share'}</button>
      </div>
    </Sheet>
  );
}

function pickInstance(instances, mcVersion, loader) {
  const clients = instances.filter((i) => i.type !== 'server');
  return clients.find((i) => i.mcVersion === mcVersion && i.loader === loader) || clients.find((i) => i.mcVersion === mcVersion) || null;
}

function JoinStatus({ app, join, copy }) {
  const [instanceId, setInstanceId] = useState(() => { const i = pickInstance(app.instances, join.mcVersion, join.loader); return i ? i.id : ''; });
  if (join.state === 'asking') return <div className="join-line"><span className="spinner" />Asking {join.hostName}…</div>;
  if (join.state === 'connecting') return <div className="join-line"><span className="spinner" />Connecting directly…</div>;
  if (join.state === 'failed') return <div className="join-line err"><Icon name="info" size={14} />{join.error}</div>;
  if (join.state !== 'connected') return null;
  const clients = app.instances.filter((i) => i.type !== 'server');
  return (
    <div className="join-ready-row">
      <span className="pill green"><span className="dot" />Connected</span>
      {join.pair && <span className="pill" title="How you're connected">{join.pair.label}</span>}
      <button className="mono addr" title="Copy address" onClick={() => copy(join.joinAddress, 'Address copied')}>{join.joinAddress}<Icon name="copy" size={12} /></button>
      <div className="grow" />
      {clients.length > 0 && <div className="field sm" title="Instance to play with"><select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>{clients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>}
      <button className="btn primary sm" disabled={!instanceId} title="Launch and drop into the world" onClick={async () => { try { await api.socialPlay(join.reqId, instanceId); app.toast('Launching into the world…', 'ok'); } catch (e) { app.toast(e.message, 'error'); } }}><Icon name="play" size={13} />Play</button>
    </div>
  );
}

function WorldsPane({ app, s, copy, onEdit, onNew }) {
  const joinFor = (w) => s.joins.filter((j) => j.host === w.host && j.worldId === w.id).slice(-1)[0];
  const join = async (w) => { try { await api.socialJoin(w.host, w.id); } catch (e) { app.toast(e.message, 'error'); } };
  return (
    <div className="worlds-pane">
      <div className="group-title"><Icon name="peers" size={13} />Shared with you</div>
      {s.worlds.shared.length === 0 && <div className="empty-card glass">When a friend adds you to a world it shows up here.</div>}
      {s.worlds.shared.map((w) => {
        const j = joinFor(w);
        const busy = j && ['asking', 'connecting'].includes(j.state);
        return (
          <div key={`${w.host}:${w.id}`} className={`world-card glass ${w.live ? 'live' : ''}`}>
            <div className="world-top">
              <div className="world-icon"><Icon name="globe" size={20} /></div>
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="truncate">{w.name}</b>
                <div className="faint" style={{ fontSize: 12 }}>by {w.hostName} · {(LOADER_META[w.loader] || { label: w.loader || 'Minecraft' }).label} {w.mcVersion}</div>
              </div>
              {w.live ? <span className="pill green"><span className="dot" />Live</span> : <span className="pill">{w.hostState === 'offline' ? 'Host offline' : 'Not running'}</span>}
              {(!j || j.state === 'failed' || j.state === 'ended') && <button className="btn primary" disabled={!w.live} title={w.live ? 'One click: Saturn sets up the Direct connection' : 'Waiting for the host to open it'} onClick={() => join(w)}><Icon name="play" size={14} />Join</button>}
              {busy && <button className="btn ghost sm" onClick={() => api.socialCancelJoin(j.reqId)}>Cancel</button>}
              {j && j.state === 'connected' && <button className="btn ghost sm icon-btn" title="Disconnect" onClick={() => api.socialCancelJoin(j.reqId)}><Icon name="x" size={14} /></button>}
            </div>
            {j && <JoinStatus app={app} join={j} copy={copy} />}
          </div>
        );
      })}
      <div className="group-title row between" style={{ marginTop: 18 }}><span className="row" style={{ gap: 6 }}><Icon name="globe" size={13} />Your worlds</span>
        <button className="btn sm" title="Share one of your instances with friends" onClick={onNew}><Icon name="plus" size={13} />Share a world</button></div>
      {s.worlds.mine.length === 0 && <div className="empty-card glass">Share a world, add members, then open it to LAN. Members click Join; no codes to paste.</div>}
      {s.worlds.mine.map((w) => (
        <div key={w.id} className={`world-card glass ${w.hosting ? 'live' : ''}`}>
          <div className="world-top">
            <div className="world-icon mine"><Icon name="server" size={19} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="truncate">{w.name}</b>
              <div className="faint" style={{ fontSize: 12 }}>{(LOADER_META[w.loader] || { label: w.loader }).label} {w.mcVersion} · {w.memberNames.length} member{w.memberNames.length === 1 ? '' : 's'}</div>
            </div>
            {w.hosting ? <span className="pill green" title="Members can join now"><span className="dot" />Hosting</span> : <span className="pill" title="Launch it and Open to LAN">Not hosting</span>}
            {!w.hosting && <button className="btn sm" title="Launch this instance" onClick={() => { const i = app.instances.find((x) => x.id === w.instanceId); if (i) app.launch(i); }}><Icon name="play" size={13} />Launch</button>}
            <button className="btn ghost sm icon-btn" title="Members and settings" onClick={() => onEdit(w)}><Icon name="pencil" size={14} /></button>
          </div>
          <div className="member-chips">
            {w.memberNames.map((m) => <span key={m.pubkey} className="member-chip"><Avatar pk={m.pubkey} name={m.name} size={20} />{m.name}</span>)}
            <button className="member-chip add" title="Add members" onClick={() => onEdit(w)}><Icon name="plus" size={12} />Add</button>
          </div>
          {!w.hosting && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Launch, open a world, then Esc → Open to LAN. Members get a Join button.</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------- Chat ----------------
function ChatPane({ app, s, friend, copy, onWorlds }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const scroller = useRef(null);
  const load = useCallback(() => { if (friend) api.socialMessages(friend.pubkey).then(setMsgs).catch(() => {}); }, [friend && friend.pubkey]);
  useEffect(() => { load(); if (friend) api.socialSetActive(friend.pubkey); return () => { api.socialSetActive(null); }; }, [load]);
  useEffect(() => on('social:update', load), [load]);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, friend && friend.pubkey]);
  if (!friend) return <div className="chat-empty"><Icon name="chat" size={34} /><b>Pick a friend to chat</b><span className="faint">Messages are end-to-end encrypted.</span></div>;
  const pres = friend.presence || { state: 'offline' };
  const [label, tone] = STATE[pres.state] || STATE.offline;
  const send = async () => { const t = text.trim(); if (!t) return; setText(''); try { await api.socialSend(friend.pubkey, t); load(); } catch (e) { app.toast(e.message, 'error'); setText(t); } };
  const invite = async (wid) => { setInviteOpen(false); try { await api.socialInvite(friend.pubkey, wid); load(); app.toast(`Invite sent to ${friend.name}`, 'ok'); } catch (e) { app.toast(e.message, 'error'); } };
  const sharedFor = (m) => s.worlds.shared.find((w) => w.host === m.world.host && w.id === m.world.id);
  return (
    <div className="chat-pane">
      <div className="chat-head">
        <Avatar pk={friend.pubkey} name={friend.name} size={38} state={pres.state} />
        <div className="grow" style={{ minWidth: 0 }}><b>{friend.name || friend.code}</b><div className="faint" style={{ fontSize: 12 }}>{statusLine(friend, s.worlds)}</div></div>
        <span className={`pill ${tone}`}><span className="dot" />{label}</span>
        <div className="invite-wrap">
          <button className="btn sm" title="Invite to one of your worlds" onClick={() => (s.worlds.mine.length ? setInviteOpen(!inviteOpen) : onWorlds())}><Icon name="globe" size={13} />Invite to world</button>
          {inviteOpen && <div className="menu glass strong">{s.worlds.mine.map((w) => <button key={w.id} onClick={() => invite(w.id)}><Icon name="globe" size={13} />{w.name}</button>)}</div>}
        </div>
      </div>
      <div className="chat-scroll" ref={scroller}>
        <div className="chat-e2e faint"><Icon name="lock" size={12} />End-to-end encrypted over public relays</div>
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const gap = !prev || m.at - prev.at > 10 * 60e3;
          return (
            <div key={m.id}>
              {gap && <div className="chat-time faint">{new Date(m.at).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: Date.now() - m.at > 86400e3 ? 'short' : undefined, day: Date.now() - m.at > 86400e3 ? 'numeric' : undefined })}</div>}
              {m.type === 'invite' && m.world ? (
                <div className={`bubble-row ${m.dir}`}>
                  <div className="invite-card glass">
                    <div className="row" style={{ gap: 10 }}><div className="world-icon"><Icon name="globe" size={18} /></div>
                      <div className="grow" style={{ minWidth: 0 }}><div className="faint" style={{ fontSize: 11 }}>{m.dir === 'out' ? 'You invited them to' : 'World invite'}</div><b className="truncate">{m.world.name}</b></div></div>
                    {m.dir === 'in' && (() => { const w = sharedFor(m); return w ? <button className="btn primary sm" disabled={!w.live} title={w.live ? 'Join now' : 'Not running right now'} onClick={async () => { try { await api.socialJoin(w.host, w.id); onWorlds(); } catch (e) { app.toast(e.message, 'error'); } }}><Icon name="play" size={13} />{w.live ? 'Join' : 'Not live'}</button> : null; })()}
                  </div>
                </div>
              ) : (
                <div className={`bubble-row ${m.dir}`}><div className={`bubble ${m.dir}`}>{m.text}{m.dir === 'out' && m.status && m.status !== 'sent' && <span className="bubble-status">{m.status === 'queued' ? 'Queued' : m.status === 'failed' ? 'Not sent' : '…'}</span>}</div></div>
              )}
            </div>
          );
        })}
      </div>
      <div className="chat-input">
        <div className="field grow"><input value={text} maxLength={2000} placeholder={`Message ${friend.name || 'friend'}`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>
        <button className="btn primary icon-btn" title="Send (Enter)" disabled={!text.trim()} onClick={send}><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}

// ---------------- Page ----------------
export default function Friends({ app }) {
  const [s, setS] = useState(null);
  const [sel, setSel] = useState(app.params.pk || null);
  const [tab, setTab] = useState(app.params.tab || (app.params.pk ? 'chat' : 'chat'));
  const [adding, setAdding] = useState(app.params.add === '1');
  const [editing, setEditing] = useState(null);
  const copy = useCopy(app);
  useEffect(() => { api.socialState().then(setS).catch(() => {}); return on('social:update', setS); }, []);
  useEffect(() => { if (app.params.pk) { setSel(app.params.pk); setTab('chat'); } if (app.params.tab) setTab(app.params.tab); }, [app.params.pk, app.params.tab]);
  const friends = useMemo(() => (s && s.friends ? s.friends.filter((f) => f.status === 'friend') : []), [s]);
  useEffect(() => { if (!sel && friends.length) setSel(friends[0].pubkey); }, [friends.length]);
  if (!s) return <div className="empty"><span className="spinner" /></div>;
  if (!s.ready) return (
    <div className="empty-card glass" style={{ maxWidth: 520 }}>
      <b>Friends is off</b><div className="faint" style={{ margin: '6px 0 12px' }}>Turn it on to chat with friends and join their worlds.</div>
      <button className="btn primary" onClick={async () => { await api.socialSetProfile({ socialEnabled: true }); api.socialState().then(setS); }}>Turn on Friends</button>
    </div>
  );
  const order = { hosting: 0, playing: 1, online: 2, offline: 3 };
  const sorted = [...friends].sort((a, b) => (order[(a.presence || {}).state] ?? 3) - (order[(b.presence || {}).state] ?? 3) || (b.last ? b.last.at : 0) - (a.last ? a.last.at : 0));
  const incoming = s.friends.filter((f) => f.status === 'incoming');
  const outgoing = s.friends.filter((f) => f.status === 'outgoing');
  const friend = friends.find((f) => f.pubkey === sel) || null;
  const online = friends.filter((f) => f.presence && f.presence.state !== 'offline').length;
  return (
    <div className="view-enter friends-layout">
      <aside className="friends-side">
        <div className="me-card glass">
          <Avatar pk={s.me.pubkey} name={s.me.name} size={42} state="online" />
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="truncate">{s.me.name}</b>
            <button className="code-chip" title="Copy your friend code" onClick={() => copy(s.me.code, 'Friend code copied')}>{s.me.code}<Icon name="copy" size={11} /></button>
          </div>
          <button className="btn icon-btn primary" title="Add friend" onClick={() => setAdding(true)}><Icon name="userPlus" size={17} /></button>
        </div>
        <div className={`relay-line faint ${s.connected ? '' : 'bad'}`} title={s.relays.map((r) => `${r.url.replace('wss://', '')}: ${r.state}`).join('\n')}>
          <i className={`f-dot ${s.connected ? 'online' : 'offline'}`} />{s.connected ? `Connected · ${s.connected}/${s.relays.length} relays` : 'Connecting to relays…'}
        </div>

        {incoming.length > 0 && <>
          <div className="group-title"><Icon name="bell" size={13} />Requests</div>
          {incoming.map((f) => (
            <div key={f.pubkey} className="req-row glass">
              <Avatar pk={f.pubkey} name={f.name} size={32} />
              <div className="grow" style={{ minWidth: 0 }}><b className="truncate">{f.name || 'Saturn player'}</b><div className="faint mono" style={{ fontSize: 10.5 }}>{f.code}</div></div>
              <button className="btn sm primary icon-btn" title="Accept" onClick={() => api.socialAccept(f.pubkey)}><Icon name="check" size={14} /></button>
              <button className="btn sm ghost icon-btn" title="Decline" onClick={() => api.socialDecline(f.pubkey)}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </>}

        <div className="group-title">Friends <span className="faint" style={{ marginLeft: 6, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>{online} online</span></div>
        <div className="friend-list glass">
          {sorted.length === 0 && <div className="faint" style={{ padding: 14, fontSize: 13 }}>No friends yet. Share your code or add theirs.</div>}
          {sorted.map((f) => {
            const st = (f.presence || {}).state || 'offline';
            return (
              <button key={f.pubkey} className={`friend-row ${sel === f.pubkey && tab === 'chat' ? 'on' : ''} ${st}`} onClick={() => { setSel(f.pubkey); setTab('chat'); }}>
                <Avatar pk={f.pubkey} name={f.name} size={34} state={st} />
                <div className="grow" style={{ minWidth: 0 }}><b className="truncate">{f.name || f.code}</b><span className="truncate">{statusLine(f, s.worlds)}</span></div>
                {f.unread > 0 && <span className="badge">{f.unread}</span>}
              </button>
            );
          })}
          {outgoing.map((f) => (
            <div key={f.pubkey} className="friend-row pending">
              <Avatar pk={f.pubkey} name={f.name} size={34} />
              <div className="grow" style={{ minWidth: 0 }}><b className="truncate">{f.name || f.code}</b><span>Request sent</span></div>
              <button className="btn ghost sm icon-btn" title="Cancel request" onClick={() => api.socialRemove(f.pubkey)}><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <section className="friends-main glass">
        <div className="friends-tabs">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'chat', label: 'Chat', icon: 'chat' }, { value: 'worlds', label: `Worlds${s.worlds.shared.filter((w) => w.live).length ? ` · ${s.worlds.shared.filter((w) => w.live).length} live` : ''}`, icon: 'globe' }]} />
          {tab === 'chat' && friend && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} title="Remove this friend" onClick={async () => { if (window.confirm(`Remove ${friend.name || 'this friend'}?`)) { await api.socialRemove(friend.pubkey); setSel(null); } }}>Remove</button>}
        </div>
        {tab === 'chat' ? <ChatPane app={app} s={s} friend={friend} copy={copy} onWorlds={() => setTab('worlds')} /> : <WorldsPane app={app} s={s} copy={copy} onEdit={(w) => setEditing(w)} onNew={() => setEditing('new')} />}
      </section>
      {adding && <AddFriendSheet app={app} me={s.me} onClose={() => setAdding(false)} />}
      {editing && <WorldSheet app={app} world={editing === 'new' ? null : editing} friends={friends} onClose={() => setEditing(null)} />}
    </div>
  );
}
