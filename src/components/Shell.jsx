export default function Shell({ brand, role, userName, tabs, tab, setTab, badges = {}, onLogout, toast, children }) {
  const cur = tabs.find((t) => t[0] === tab) || tabs[0]
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">🦷 {brand}<small>{role}</small></div>
        <nav>
          {tabs.map(([k, icon, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <span>{icon}</span><span>{label}</span>
              {badges[k] > 0 && <b className="badge">{badges[k]}</b>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="muted">{userName}</div>
          <button className="btn small" onClick={onLogout}>Logout</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <h2>{cur[2]}</h2>
          <button className="btn small mobile-only" onClick={onLogout}>Logout</button>
        </header>
        {children}
      </main>
      <nav className="tabbar">
        {tabs.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="ico">{icon}{badges[k] > 0 && <b className="badge">{badges[k]}</b>}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </div>
  )
}
