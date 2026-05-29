import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Landing from './pages/Landing';
import About from './pages/About';
import Toolkit from './pages/Toolkit';
import Thoughts from './pages/Thoughts';
import Contact from './pages/Contact';
import SendGridTest from './pages/SendGridTest';

function App() {
  return (
    <Router>
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/toolkit" element={<Toolkit />} />
          <Route path="/thoughts" element={<Thoughts />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/sendgrid-test" element={<SendGridTest />} />
        </Routes>
      </main>
      <footer className="footer">
        © Abhishek Limaye — Cybersecurity & Digital Forensics
      </footer>
    </Router>
  );
}

export default App;
