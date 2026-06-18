import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Trends from './pages/Trends'
import Settings from './pages/Settings'
import NewSession from './pages/NewSession'
import SessionDetail from './pages/SessionDetail'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/session/new" element={<NewSession />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
