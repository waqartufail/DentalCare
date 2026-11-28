import { useState } from 'react'
import { t, LANGS, getLang, setLang } from '../i18n'
import { THEMES, getTheme, setTheme } from '../theme'

export function PrefsModal({ close }) {
  const [theme, setT] = useState(getTheme())
  const lang = getLang()
  const pick = (id) => { setTheme(id); setT(id) }
  const grid = (dark) => (
    <div className="themes">
      {THEMES.filter((x) => x.dark === dark).map((x) => (
        <button key={x.id} type="button" className={'theme-opt' + (theme === x.id ? ' on' : '')} onClick={() => pick(x.id)}>
          <div className="sw"><i style={{ flex: 2, background: `linear-gradient(135deg, ${x.colors[0]}, ${x.colors[1]})` }} /><i style={{ flex: 1, background: `linear-gradient(160deg, ${x.colors[2]}, ${x.colors[3]})` }} /></div>
          {t(x.key)}
        </button>
      ))}
    </div>
  )
  return (
    <div className="modal" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3 style={{ margin: 0 }}>{t('pref.title')}</h3><button className="btn small" onClick={close}>{t('c.close')}</button></div>
        <h4>{t('pref.theme')} · {t('pref.light')}</h4>
        {grid(false)}
        <h4>{t('pref.theme')} · {t('pref.dark')}</h4>
        {grid(true)}
        <h4>{t('pref.language')}</h4>
        <div className="langs">
          {LANGS.map((l) => (
            <button key={l.code} type="button" className={'lang-opt' + (lang === l.code ? ' on' : '')} onClick={() => { if (l.code !== lang) { setLang(l.code) } close() }}>
              <b>{l.name}</b><small>{l.regions}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PrefsButton({ floating = false }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={'btn small' + (floating ? ' prefs-fab' : '')} aria-label={t('pref.title')} title={t('pref.title')} onClick={() => setOpen(true)}>🎨 🌐</button>
      {open && <PrefsModal close={() => setOpen(false)} />}
    </>
  )
}
