import { useState } from 'react'
import TitleBlock from './components/TitleBlock'
import Stepper, { type Step } from './components/Stepper'
import UploadScreen from './screens/UploadScreen'
import ExtractScreen from './screens/ExtractScreen'
import ReviewScreen from './screens/ReviewScreen'
import ComplianceScreen from './screens/ComplianceScreen'
import PrintReport from './components/PrintReport'

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [reachable, setReachable] = useState<Set<Step>>(new Set<Step>(['upload']))

  function goTo(next: Step) {
    setReachable((prev) => new Set(prev).add(next))
    setStep(next)
  }

  return (
    <>
    <div className="drafting-grid flex min-h-screen flex-col print:hidden">
      <TitleBlock />

      <div className="border-b border-grid-line bg-plan-paper/80">
        <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
          <Stepper current={step} reachable={reachable} onNavigate={goTo} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        <Screen step={step} onNavigate={goTo} />
      </main>

      <footer className="border-t border-grid-line bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-2 sm:px-6">
          <span className="eyebrow">Komm.ONE · IPAI Builder Day · Heilbronn</span>
          <span className="font-mono text-[0.6rem] text-ink/40">PLANRAUM v0.1</span>
        </div>
      </footer>
    </div>
    <PrintReport />
    </>
  )
}

function Screen({
  step,
  onNavigate,
}: {
  step: Step
  onNavigate: (s: Step) => void
}) {
  switch (step) {
    case 'upload':
      return (
        <UploadScreen
          onExtract={() => onNavigate('extract')}
        />
      )
    case 'extract':
      return (
        <ExtractScreen
          onDone={() => onNavigate('review')}
          onAbort={() => onNavigate('upload')}
        />
      )
    case 'review':
      return <ReviewScreen onContinue={() => onNavigate('compliance')} />
    case 'compliance':
      return <ComplianceScreen />
  }
}
