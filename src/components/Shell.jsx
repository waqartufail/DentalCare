import { t } from '../i18n'
import { PrefsButton } from './Prefs'
import { ClinicHead, SideBrand } from './ClinicBrand'

export default function Shell({ clinic, role, userName, tabs, tab, setTab, badges = {}, onLogout, toast, children }) {
  const cur = tabs.find((x) => x[0] === tab) || tabs[0]
  return (
    <div className="shell">
      <aside className="side">
        <SideBrand clinic={clinic} role={t(role)} />
        <nav>
          {tabs.map(([k, icon, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <span>{icon}</span><span>{t(label)}</span>
              {badges[k] > 0 && <b className="badge">{badges[k]}</b>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="muted">{userName}</div>
          <PrefsButton />
          <button className="btn small" onClick={onLogout}>{t('c.logout')}</button>
        </div>
      </aside>
      <main className="main">
        <ClinicHead clinic={clinic} />
        <header className="topbar">
          <h2>{t(cur[2])}</h2>
          <div className="topbar-actions mobile-only">
            <PrefsButton />
            <button className="btn small" onClick={onLogout}>{t('c.logout')}</button>
          </div>
        </header>
        {children}
      </main>
      <nav className="tabbar">
        {tabs.map(([k, icon, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <span className="ico">{icon}{badges[k] > 0 && <b className="badge">{badges[k]}</b>}</span>
            <span>{t(label)}</span>
          </button>
        ))}
      </nav>
      {toast && <div className={'toast' + (toast.bad ? ' bad' : '')}>{toast.msg}</div>}
    </div>
  )
}
