# Abhishek Limaye – Personal Portfolio

This repository contains the source code for my personal portfolio website — a full-stack web application designed to showcase my skills, projects, and professional experience.

The project is structured as a monorepo, consisting of a modern React frontend and a lightweight Node.js backend.

---

## 🌐 Live Features

- Responsive Single-Page Application (SPA)
- Modular component-driven UI
- Secure contact form with backend email handling
- Resume download support
- Scalable full-stack architecture

---

## 📁 Project Structure

react-portfolio/ → Frontend (React + Vite)
server/ → Backend (Node.js + Express)


---

## 🎨 Frontend – React Portfolio

**Location:** `react-portfolio/`

### Key Sections
- Landing Page
- About Me
- Toolkit / Skills
- Thoughts / Blog
- Contact Form
- Resume Download

### Technologies
- React (v19)
- Vite (v7)
- React Router DOM (v7)
- ESLint (v9)
- Spark-MD5
- CSS (custom styling)

### Run Frontend Locally
```bash
cd react-portfolio
npm install
npm run dev
⚙️ Backend – Node.js Server
Location: server/
Purpose
Handles contact form submissions securely via email.
Technologies
Node.js
Express.js (v5)
SendGrid Mail
CORS
dotenv
Environment Variables
Create a .env file inside server/:
SENDGRID_API_KEY=your_api_key_here
FROM_EMAIL=your_verified_email
TO_EMAIL=your_email
Run Backend Locally
cd server
npm install
node index.js
🔐 Security Notes
.env files are excluded from version control
No sensitive keys are committed
CORS is configured for controlled access
📄 Resume
Resume is available at:
react-portfolio/public/resume.pdf
📬 Contact
Feel free to reach out via the contact form or connect with me on LinkedIn.
© Abhishek Limaye

---

## 4️⃣ Initialize Git (if not already)

From **project root** in Terminal:

```bash
git init
git status