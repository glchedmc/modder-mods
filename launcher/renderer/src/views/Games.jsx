import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons';
import { api, isElectron } from '../api';
import { Segmented, Sheet, timeAgo } from '../components/ui';

export function fmtSize(bytes) {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(gb >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function initials(name) {
  const words = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

function hue(name) { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

export function sortGames(games, sort, query) {
  const q = query.trim().toLowerCase();
  const list = games.filter((g) => !q || g.name.toLowerCase().includes(q));
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    size: (a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0),
    recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0),
  }[sort] || ((a, b) => a.name.localeCompare(b.name));
  return list.sort((a, b) => (Number(b.favorite) - Number(a.favorite)) || by(a, b) || a.name.localeCompare(b.name));
}

function Art({ game }) {
  const [src, setSrc] = useState(game.art ? (isElectron ? `glass-art://art/${game.art}` : game.art) : null);
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    if (src || game.source !== 'steam' || tried.current) return;
    tried.current = true;
    api.gameArt(game.appid).then((name) => { if (name) setSrc(isElectron ? `glass-art://art/${name}` : name); }).catch(() => {});
  }, [game.appid, game.source, src]);
  if (src && !failed) return <img className={`game-art ${/header/.test(src) ? 'wide' : ''}`} src={src} alt="" draggable={false} onError={() => setFailed(true)} />;
  const h = hue(game.name);
  return (
    <div className="game-art fallback" style={{ background: `linear-gradient(160deg, hsl(${h} 70% 45% / .85), hsl(${(h + 60) % 360} 70% 25% / .9))` }}>
      <span>{initials(game.name)}</span>
      <small>{game.source === 'manual' ? 'Added by you' : 'Steam'}</small>
    </div>
  );
}

function AddGameSheet({ onClose, onAdd }) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const pick = async () => {
    const p = await api.pickGameExecutable();
    if (p) { setPath(p); if (!name) setName(p.split(/[\\/]/).pop().replace(/\.(app|exe|sh|x86_64|AppImage|desktop)$/i, '')); }
  };
  return (
    <Sheet onClose={onClose} width={460}>
      <h3 style={{ marginTop: 0 }}>Add a game</h3>
      <p className="faint" style={{ marginTop: -4, fontSize: 13 }}>Any app or executable that isn’t in Steam: a .app on Mac, or a binary, script, AppImage or .desktop file on Linux.</p>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <div className="field" style={{ flex: 1 }}><Icon name="folder" size={15} /><input value={path} readOnly placeholder="No file chosen" /></div>
        <button className="btn" onClick={pick}>Choose…</button>
      </div>
      <div className="field" style={{ marginBottom: 16 }}><Icon name="text" size={15} /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={80} /></div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!path} onClick={() => onAdd({ path, name })}>Add game</button>
      </div>
    </Sheet>
  );
}

export default function Games({ app }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(() => localStorage.getItem('games.sort') || 'name');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [menu, setMenu] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const filterOn = app.settings.gameFilter !== false;
  const reload = () => api.listGames().then(setData).catch((e) => { setData({ steamInstalled: false, games: [], error: e.message }); });
  useEffect(() => { reload(); }, [filterOn]);
  // Steam store info still loading for some games: check again shortly.
  useEffect(() => {
    if (!data || !data.metaPending) return undefined;
    const t = setTimeout(reload, 5000);
    return () => clearTimeout(t);
  }, [data]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const key = (e) => e.key === 'Escape' && close();
    window.addEventListener('click', close); window.addEventListener('blur', close); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); window.removeEventListener('keydown', key); };
  }, [menu]);
  const toggleFilter = () => app.saveSettings({ gameFilter: !filterOn });
  const setVisibility = async (g, mode) => {
    setMenu(null);
    try {
      await api.setGameVisibility(g.id, mode);
      app.toast(mode === 'show' ? `${g.name} will always show` : mode === 'hide' ? `Hid ${g.name}` : `${g.name} follows the filter again`, 'ok');
      reload();
    } catch (e) { app.toast(e.message, 'error'); }
  };
  const openMenu = (e, g) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 150), game: g }); };
  useEffect(() => { localStorage.setItem('games.sort', sort); }, [sort]);
  const shown = useMemo(() => (data ? sortGames([...data.games], sort, query) : []), [data, sort, query]);

  const play = async (g) => {
    setBusy(g.id);
    try { await api.playGame(g.id); app.toast(g.source === 'steam' ? `Starting ${g.name} in Steam…` : `Starting ${g.name}…`, 'ok'); reload(); } catch (e) { app.toast(e.message, 'error'); }
    setTimeout(() => setBusy(null), 1500);
  };
  const fav = async (g) => {
    setData((d) => ({ ...d, games: d.games.map((x) => (x.id === g.id ? { ...x, favorite: !g.favorite } : x)) }));
    try { await api.setGameFavorite(g.id, !g.favorite); } catch (e) { app.toast(e.message, 'error'); reload(); }
  };
  const remove = async (g) => { try { await api.removeManualGame(g.id); reload(); } catch (e) { app.toast(e.message, 'error'); } };
  const add = async (entry) => {
    try { const e = await api.addManualGame(entry); setAdding(false); app.toast(`Added ${e.name}`, 'ok'); reload(); } catch (e) { app.toast(e.message, 'error'); }
  };

  if (!data) return <div className="view-enter"><div className="empty">Looking for games…</div></div>;
  const steamCount = data.games.filter((g) => g.source === 'steam').length;
  return (
    <div className="view-enter games-view">
      <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="field search"><Icon name="search" size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" /></div>
          <Segmented value={sort} onChange={setSort} options={[{ value: 'name', label: 'Name' }, { value: 'recent', label: 'Recent', icon: 'clock' }, { value: 'size', label: 'Size', icon: 'memory' }]} />
          <button className={`filter-chip ${filterOn ? 'on' : ''}`} onClick={toggleFilter}
            title={filterOn ? 'Only driving, sports, casual, family and party games. Click to show everything.' : 'Showing every game. Click to hide violent games again.'}>
            <Icon name="shield" size={14} />
            {filterOn ? <>No-violence filter{data.hiddenCount > 0 && <span className="filter-count">{data.hiddenCount} hidden</span>}<Icon name="x" size={12} /></> : 'Filter off'}
          </button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost icon-btn" title="Rescan" onClick={reload}><Icon name="refresh" size={16} /></button>
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add game manually</button>
        </div>
      </div>

      {!data.steamInstalled && (
        <div className="glass card games-empty">
          <div className="games-empty-icon"><Icon name="cube" size={26} /></div>
          <div>
            <h4>Steam isn’t installed</h4>
            <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
              Saturn looks for Steam in {navigator.userAgent.includes('Mac') ? '~/Library/Application Support/Steam' : '~/.steam/steam, ~/.local/share/Steam and the Flatpak folder'}. Install Steam and your games show up here, or add any game by hand.
            </div>
          </div>
          <button className="btn" onClick={() => api.openUrl('https://store.steampowered.com/about/')}><Icon name="external" size={14} />Get Steam</button>
        </div>
      )}
      {data.steamInstalled && steamCount === 0 && <div className="glass card empty-card" style={{ marginBottom: 14 }}>Steam is installed but no games are fully installed yet.</div>}

      {shown.length > 0 ? (
        <div className="games-grid stagger">
          {shown.map((g) => (
            <div key={g.id} className={`glass card hover game-tile ${g.favorite ? 'fav' : ''} ${g.installed === false ? 'missing' : ''} ${g.filter && !g.filter.show ? 'filtered' : ''}`}
              title={g.filter ? g.filter.reason : undefined} onDoubleClick={() => play(g)} onContextMenu={(e) => openMenu(e, g)}>
              <div className="game-cover"><Art game={g} />
                <button className={`game-pin ${g.favorite ? 'on' : ''}`} title={g.favorite ? 'Unpin' : 'Pin to top'} onClick={() => fav(g)}><Icon name="pin" size={14} /></button>
              </div>
              <div className="game-body">
                <h4 className="truncate" title={g.name}>{g.name}</h4>
                <div className="row faint game-meta" style={{ gap: 6, fontSize: 11.5, marginTop: 3 }}>
                  <span className={`pill ${g.source === 'steam' ? 'blue' : 'violet'}`}>{g.source === 'steam' ? 'Steam' : 'Manual'}</span>
                  {g.filter && !g.filter.show && <span className="pill red" title={g.filter.reason}>Filtered</span>}
                  {g.filter && g.filter.source === 'user' && g.source === 'steam' && g.filter.show && <span className="pill green" title={g.filter.reason}>Always</span>}
                  {fmtSize(g.sizeBytes) && <span>{fmtSize(g.sizeBytes)}</span>}
                  {g.lastPlayed && <span className="truncate">· {timeAgo(new Date(g.lastPlayed).toISOString())}</span>}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 10 }}>
                  <button className="btn primary sm" style={{ flex: 1 }} disabled={busy === g.id || g.installed === false} onClick={() => play(g)}><Icon name="play" size={12} />{busy === g.id ? 'Starting…' : 'Play'}</button>
                  {g.source === 'steam'
                    ? <button className="btn sm icon-btn" title="Open in Steam" onClick={() => api.openGameInSteam(g.id).catch((e) => app.toast(e.message, 'error'))}><Icon name="external" size={14} /></button>
                    : <button className="btn sm icon-btn" title="Remove" onClick={() => remove(g)}><Icon name="trash" size={14} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (data.games.length > 0 && <div className="empty">No games match “{query}”.</div>)}
      {filterOn && data.hiddenCount > 0 && (
        <div className="hidden-games">
          <button className="btn ghost sm" onClick={() => setShowHidden(!showHidden)}><Icon name={showHidden ? 'chevronDown' : 'chevron'} size={14} />{data.hiddenCount} hidden by the filter</button>
          {showHidden && (
            <div className="hidden-list glass">
              {data.hidden.map((h) => (
                <div key={h.id} className="row between hidden-row">
                  <span className="truncate"><b>{h.name}</b> <span className="faint">· {h.reason}</span></span>
                  <button className="btn sm" onClick={() => setVisibility(h, 'show')}>Always show</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {data.storeOffline && filterOn && <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>Steam store is unreachable right now, so games without saved store info are shown unfiltered.</div>}
      {menu && (
        <div className="context-menu glass strong" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div className="context-title truncate">{menu.game.name}</div>
          <button onClick={() => setVisibility(menu.game, 'show')}><Icon name="check" size={14} />Always show</button>
          <button onClick={() => setVisibility(menu.game, 'hide')}><Icon name="x" size={14} />Hide</button>
          {menu.game.filter && menu.game.filter.source === 'user' && menu.game.source === 'steam' && <button onClick={() => setVisibility(menu.game, 'auto')}><Icon name="refresh" size={14} />Let the filter decide</button>}
        </div>
      )}
      {data.games.length === 0 && data.steamInstalled && <div className="empty">Nothing here yet. Add a game manually to launch it from Saturn.</div>}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 18 }}>Read from your local Steam folders only. The filter uses Steam’s public store info (genres, tags, content descriptors). No Steam login or API key. Right-click a game to always show or hide it.</div>
      {adding && <AddGameSheet onClose={() => setAdding(false)} onAdd={add} />}
    </div>
  );
}
