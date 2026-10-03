import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HowItWorks from './HowItWorks'
const DatasetExplorer = React.lazy(() => import('./DatasetExplorer'))

if (window.location.pathname === '/principle') {
  window.history.replaceState(null, '', `/how-it-works${window.location.search}${window.location.hash}`)
}

const page = window.location.pathname === '/how-it-works' ? <HowItWorks /> : window.location.pathname === '/dataset' ? <React.Suspense fallback={null}><DatasetExplorer /></React.Suspense> : <App />
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page}</React.StrictMode>)
