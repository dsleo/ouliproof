import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HowItWorks from './HowItWorks'
import Principle from './Principle'

const page = window.location.pathname === '/how-it-works' ? <HowItWorks /> : window.location.pathname === '/principle' ? <Principle /> : <App />
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{page}</React.StrictMode>)
