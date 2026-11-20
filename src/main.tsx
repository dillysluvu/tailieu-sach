import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion } from 'motion/react'
import App from './App'
import './index.css'

// Tính năng motion (layout/FLIP) chỉ tải sau first paint.
const loadFeatures = () => import('./lib/motionFeatures').then((module) => module.default)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={loadFeatures} strict>
      <App />
    </LazyMotion>
  </StrictMode>,
)
