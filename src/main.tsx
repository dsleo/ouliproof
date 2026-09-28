import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HowItWorks from './HowItWorks'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{window.location.pathname === '/how-it-works' ? <HowItWorks /> : <App />}</React.StrictMode>)
