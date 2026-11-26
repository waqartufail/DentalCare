// Sirf testing ke liye. Live se pehle 99_remove_test_data.sql chalayein aur VITE_TEST_LOGIN band kar dein.
export const TEST_PASSWORD = 'Test@12345'
export const TEST_USERS = [
  { label: 'Admin', email: 'admin.test@dentcare.test' },
  { label: 'Doctor', email: 'doctor.test@dentcare.test' },
  { label: 'Receptionist', email: 'receptionist.test@dentcare.test' },
  { label: 'Lab Technician', email: 'lab.test@dentcare.test' },
  { label: 'Helper', email: 'helper.test@dentcare.test' },
]
export const TEST_LOGIN_ON = import.meta.env.VITE_TEST_LOGIN === 'true'
