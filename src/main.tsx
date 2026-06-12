import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PlanProvider } from './state/PlanContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlanProvider>
      <App />
    </PlanProvider>
  </StrictMode>,
)
