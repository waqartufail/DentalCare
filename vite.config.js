import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages par app https://user.github.io/REPO/ par chalti hai, isliye base path chahiye.
// Workflow BASE_PATH khud set karta hai. Local me '/' rehta hai.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
