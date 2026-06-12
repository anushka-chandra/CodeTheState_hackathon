import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PlanProvider } from './state/PlanContext.tsx'
import { I18nProvider } from './i18n/I18nContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlanProvider>
        <App />
      </PlanProvider>
    </I18nProvider>
  </StrictMode>,
)
