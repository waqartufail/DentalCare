import { useState } from 'react'
import Shell from '../components/Shell'
import Attendance from '../components/Attendance'

export default function Helper({ profile, clinic, onLogout }) {
  const [tab, setTab] = useState('attendance')
  return (
    <Shell clinic={clinic} role="role.helper" userName={profile.full_name} tabs={[['attendance', '🕒', 'tab.attendance']]} tab={tab} setTab={setTab} onLogout={onLogout}>
      <Attendance userId={profile.id} autoCheckIn />
    </Shell>
  )
}
