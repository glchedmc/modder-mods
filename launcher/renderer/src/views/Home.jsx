import Icon from '../icons';
import { InstanceCover } from '../components/backgrounds';
import { LOADER_META, timeAgo, fmtHours, ModIcon } from '../components/ui';

export default function Home({ app }) {
  const { instances, selected, setSelected, launch, launchState, compat, go, startPort, account } = app;
  const inst = selected;
  if (!inst) {
    return (
      <div className="empty glass card view-enter">
        <h3>Welcome to Saturn</h3>
        <p className="muted">Create your first instance to get playing.</p>
        <button className="btn primary" onClick={() => go('library', { create: true })}><Icon name="plus" size={16} /> New Instance</button>
      </div>
    );
  }
  const busy = launchState && launchState.id === inst.id && launchState.state !== 'idle';
  const pct = busy && launchState.total ? Math.round((launchState.done / launchState.total) * 100) : 0;
  const needsPort = (inst.mods || []).filter((m) => compat[m.file] && compat[m.file].status === 'needs-port');
  const updates = (inst.mods || []).filter((m) => compat[m.file] && compat[m.file].status === 'update');
  const loader = LOADER_META[inst.loader];
  const recent = instances.filter((i) => i.id !== inst.id && i.type !== 'server').slice(0, 3);

  return (
    <div className="view-enter stagger">
      <section className="hero glass">
        <div className="art"><InstanceCover instance={inst} settings={app.settings} hero animated={!app.settings.reduceMotion} /></div>
        <div className="stats">
          <div className="stat glass flat"><b>{(inst.mods || []).length}</b><span>Mods</span></div>
          <div className="stat glass flat"><b>{fmtHours(inst.playTimeSec)}</b><span>Played</span></div>
          <div className="stat glass flat"><b>{(inst.memoryMb / 1024).toFixed(0)} GB</b><span>Memory</span></div>
        </div>
        <div className="eyebrow">
          <span className="pill"><Icon name="cube" size={12} />{inst.mcVersion}</span>
          <span className="pill">{loader.label}{inst.loaderVersion ? ` ${inst.loaderVersion}` : ''}</span>
          {inst.companion && <span className="pill violet"><Icon name="sparkles" size={12} />Companion</span>}
        </div>
        <h2>{inst.name}</h2>
        <p>{inst.type === 'server' ? 'Local server. Starts in a console with your chosen memory.' : `Last played ${timeAgo(inst.lastPlayed).toLowerCase()}. ${account ? `Signed in as ${account.name}.` : 'Sign in with Microsoft to play online.'}`}</p>
        <div className="actions">
          <button className={`play-btn ${busy ? 'busy' : ''}`} onClick={() => !busy && launch(inst)}>
            {busy ? <span className="activity" style={{ padding: 0, minWidth: 0, background: 'none' }}><span className="spinner" /></span> : <Icon name="play" size={22} />}
            {busy ? (launchState.state === 'running' ? 'Running' : `${launchState.phase || 'Preparing'}…`) : inst.type === 'server' ? 'Start Server' : 'Play'}
          </button>
          {busy && launchState.state !== 'running' && (
            <div style={{ width: 220 }}>
              <div className="row between" style={{ fontSize: 12, marginBottom: 6, color: 'rgba(255,255,255,.85)' }}><span>{launchState.phase}</span><span>{pct}%</span></div>
              <div className="progress"><i style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {!busy && <>
            <button className="btn" onClick={() => go('instance', { id: inst.id })}><Icon name="layers" size={16} />Manage</button>
            <button className="btn" onClick={() => go('discover')}><Icon name="plus" size={16} />Add Mods</button>
          </>}
        </div>
      </section>

      {app.lastFailure && app.lastFailure.id === inst.id && !busy && (
        <div className="glass card" style={{ marginTop: 14, padding: 16, display: 'flex', gap: 12, alignItems: 'center', borderColor: 'rgba(255,120,120,.5)' }}>
          <Icon name="info" size={20} style={{ color: 'var(--red)', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{inst.name} didn’t start</b>
            <div className="muted" style={{ fontSize: 13, marginTop: 2, wordBreak: 'break-word' }}>{app.lastFailure.error}</div>
          </div>
          <button className="btn sm" onClick={() => app.showLaunchLog(inst.id)}><Icon name="folder" size={13} />Show log</button>
          <button className="btn sm" onClick={app.dismissFailure}>Dismiss</button>
        </div>
      )}

      {needsPort.length > 0 && (
        <div className="upgrade-card glass" style={{ marginTop: 14 }}>
          <div className="orb"><Icon name="wand" size={22} /></div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>{needsPort.length === 1 ? `${needsPort[0].title} has no ${inst.mcVersion} build` : `${needsPort.length} mods have no ${inst.mcVersion} build`}</h4>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Grok can port it to {inst.mcVersion}, build it, and install it here. You can watch every step.</div>
          </div>
          <button className="btn grok" onClick={() => startPort(inst, needsPort[0])}><Icon name="sparkles" size={16} />Upgrade to {inst.mcVersion}</button>
        </div>
      )}

      <div className="grid cols-3" style={{ marginTop: 14 }}>
        <div className="card glass hover" onClick={() => go('settings', { section: 'companion' })}>
          <div className="row between"><Icon name="gauge" size={20} style={{ color: '#9fc3ff' }} /><span className="pill green"><span className="dot" />On</span></div>
          <h4 style={{ marginTop: 14 }}>HUD & Visuals</h4>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>FPS, coordinates, armor, zoom, compact tooltips and {app.featureCount - 5} more.</div>
        </div>
        <div className="card glass hover" onClick={() => go('instance', { id: inst.id })}>
          <div className="row between"><Icon name="refresh" size={20} style={{ color: '#ffd08a' }} />{updates.length ? <span className="pill amber">{updates.length} update{updates.length > 1 ? 's' : ''}</span> : <span className="pill green">Up to date</span>}</div>
          <h4 style={{ marginTop: 14 }}>Mod Health</h4>
          <div className="row" style={{ marginTop: 8, gap: -6 }}>
            {(inst.mods || []).slice(1, 7).map((m, i) => <span key={m.file} style={{ marginLeft: i ? -8 : 0 }}><ModIcon src={m.icon} title={m.title} size={28} /></span>)}
          </div>
        </div>
        <div className="card glass hover" onClick={() => go('studio')}>
          <div className="row between"><Icon name="sparkles" size={20} style={{ color: '#c4b2ff' }} /><span className="pill violet">Grok</span></div>
          <h4 style={{ marginTop: 14 }}>Grok Studio</h4>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Port mods from older versions to {inst.mcVersion}. Source, build logs and fixes, all in one place.</div>
        </div>
      </div>

      {recent.length > 0 && <>
        <div className="section-title"><h3>Jump back in</h3><a onClick={() => go('library')}>See all</a></div>
        <div className="grid cols-3">
          {recent.map((i) => (
            <div key={i.id} className="glass card hover instance-card" onClick={() => setSelected(i.id)}>
              <div className="cover"><InstanceCover instance={i} settings={app.settings} /></div>
              <div className="body" style={{ paddingTop: 13 }}>
                <div className="row between"><h4 className="truncate">{i.name}</h4><span className="pill">{LOADER_META[i.loader].label}</span></div>
                <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{i.mcVersion} · {timeAgo(i.lastPlayed)}</div>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}
