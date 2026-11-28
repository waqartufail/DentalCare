import { useMemo, useState } from 'react'
import { t } from '../i18n'
import { money } from '../util'

// Treatments ko Main Category ke hisab se group karta hai (bina category wali "Uncategorized" me)
export function groupTreatments(treatments, categories) {
  const cats = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const known = new Set(cats.map((c) => c.id))
  const groups = cats.map((c) => ({ id: c.id, name: c.name, items: treatments.filter((x) => x.category_id === c.id) })).filter((g) => g.items.length)
  const rest = treatments.filter((x) => !x.category_id || !known.has(x.category_id))
  if (rest.length) groups.push({ id: 'none', name: t('cat.none'), items: rest })
  return groups
}

export default function TreatmentPicker({ treatments, categories = [], pick, toggle }) {
  const [q, setQ] = useState('')
  const list = q ? treatments.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())) : treatments
  const groups = useMemo(() => groupTreatments(list, categories), [list, categories])
  const showHeads = categories.length > 0
  return (
    <>
      <input placeholder={t('c.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: '.5rem' }} />
      <div className="picklist">
        {groups.length === 0 && <p className="muted">—</p>}
        {groups.map((g) => (
          <div key={g.id}>
            {showHeads && <div className="cat-h">{g.name}</div>}
            {g.items.map((x) => (
              <label key={x.id} className="check pick">
                <input type="checkbox" checked={pick.includes(x.id)} onChange={() => toggle(x.id)} />
                <span>{x.name}{x.needs_lab && <span className="pill blue" style={{ marginInlineStart: 6 }}>Lab</span>}</span>
                <span className="muted">{money(x.fee)}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
