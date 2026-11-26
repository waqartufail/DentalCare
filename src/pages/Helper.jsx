import { useState } from 'react'
import Shell from '../components/Shell'
import Attendance from '../components/Attendance'

export default function Helper({ profile, clinic, onLogout }) {
  const [tab, setTab] = useState('attendance')
  return (
    <Shell brand={clinic.name} role="Helper" userName={profile.full_name} tabs={[['attendance', '🕒', 'Attendance']]} tab={tab} setTab={setTab} onLogout={onLogout}>
      <Attendance userId={profile.id} autoCheckIn />
    </Shell>
  )
}
