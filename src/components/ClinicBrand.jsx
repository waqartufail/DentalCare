// Clinic ka logo + naam. Screen ke hisab se khud chhota/bara hota hai (CSS clamp).
export function ClinicHead({ clinic }) {
  return (
    <div className="clinic-head">
      {clinic.logo_url ? <img src={clinic.logo_url} alt={clinic.name} /> : <span className="logo-fallback">🦷</span>}
      <b>{clinic.name}</b>
    </div>
  )
}

export function SideBrand({ clinic, role }) {
  return (
    <div className="brand">
      <div className="brand-logo">
        {clinic.logo_url ? <img src={clinic.logo_url} alt="" /> : <span>🦷</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{clinic.name}</span>
      </div>
      <small>{role}</small>
    </div>
  )
}
