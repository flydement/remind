import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerNotifyWorker } from './notify'
import './styles.css'

void registerNotifyWorker()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
