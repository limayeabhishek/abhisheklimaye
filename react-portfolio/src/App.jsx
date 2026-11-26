import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ActiveUserGuard from './components/ActiveUserGuard';
import Header from './components/Header';
import Landing from './pages/Landing';
import About from './pages/About';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Toolkit from './pages/Toolkit';
import OsintPlatform from './pages/OsintPlatform';
import HashCalculator from './pages/HashCalculator';
import PortScanner from './pages/PortScanner';
import PassCheck from './pages/PassCheck';
import AudioSync from './pages/AudioSync';
import Ultron from './pages/Ultron';
import Thoughts from './pages/Thoughts';
import ThoughtDetail from './pages/ThoughtDetail';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Admin from './pages/Admin';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:slug" element={<ProjectDetail />} />
            <Route path="/thoughts" element={<Thoughts />} />
            <Route path="/thoughts/:slug" element={<ThoughtDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/ultron" element={<Ultron />} />
            <Route path="/login" element={<Login />} />

            {/* Protected Admin Route */}
            <Route
              path="/admin"
              element={
                <ActiveUserGuard requireAdmin>
                  <Admin />
                </ActiveUserGuard>
              }
            />

            {/* Protected Toolkit Routes */}
            <Route
              path="/toolkit"
              element={
                <ActiveUserGuard>
                  <Toolkit />
                </ActiveUserGuard>
              }
            />
            <Route
              path="/toolkit/audiosync"
              element={
                <ActiveUserGuard>
                  <AudioSync />
                </ActiveUserGuard>
              }
            />
            <Route
              path="/toolkit/osint"
              element={
                <ActiveUserGuard>
                  <OsintPlatform />
                </ActiveUserGuard>
              }
            />
            <Route
              path="/toolkit/hash-calculator"
              element={
                <ActiveUserGuard>
                  <HashCalculator />
                </ActiveUserGuard>
              }
            />
            <Route
              path="/toolkit/port-scanner"
              element={
                <ActiveUserGuard>
                  <PortScanner />
                </ActiveUserGuard>
              }
            />
            <Route
              path="/toolkit/pass-check"
              element={
                <ActiveUserGuard>
                  <PassCheck />
                </ActiveUserGuard>
              }
            />

            {/* Legacy / Alias Routes */}
            <Route
              path="/osint"
              element={
                <ActiveUserGuard>
                  <OsintPlatform />
                </ActiveUserGuard>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="footer">
          Abhishek Limaye &mdash; Cybersecurity &amp; Digital Forensics
        </footer>
      </Router>
    </AuthProvider>
  );
}

export default App;
