import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HowItWorks from './HowItWorks'

if (window.location.pathname === '/principle') {
  window.history.replaceState(null, '', `/how-it-works${window.location.search}${window.location.hash}`)
}

const page = window.location.pathname === '/how-it-works' ? <HowItWorks /> : <App />
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page}</React.StrictMode>)
