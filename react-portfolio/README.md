# Interactive Cybersecurity Portfolio

This project is a personal portfolio website built with React. It showcases a variety of skills and projects related to cybersecurity and digital forensics. It includes a functional contact form and an interactive toolkit with several demonstration applications.

## Features

*   **Responsive Design:** The website is fully responsive and accessible on mobile, tablet, and desktop devices.
*   **Contact Form:** A functional contact form that uses SendGrid to send emails.
*   **Interactive Toolkit:** A collection of demonstration tools, including:
    *   **Hash Calculator:** Calculates MD5 and SHA256 hashes for text and files.
    *   **Log Timeline Analyzer:** Sorts log entries chronologically.
    *   **Human Identity Creator:** Simulates generating an identity profile.
    *   **Digital Artifact Scanner:** Simulates a security scan for a given hash.

## Setup and Running

This project is divided into two parts: the `react-portfolio` frontend and the `server` backend. You will need to run both for the full functionality of the website.

### Prerequisites

*   [Node.js](https://nodejs.org/) (v14 or later)
*   [npm](https://www.npmjs.com/)

### 1. Backend Setup

The backend server handles the contact form and some of the toolkit features.

1.  **Navigate to the `server` directory:**
    ```bash
    cd server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create an environment file:**
    Create a `.env` file in the `server` directory and add the following variables:
    ```
    SENDGRID_API_KEY='your_sendgrid_api_key'
    EMAIL_TO='your_recipient_email@example.com'
    EMAIL_FROM='your_verified_sendgrid_sender_email@example.com'
    ```
    *   `SENDGRID_API_KEY`: Your API key from your SendGrid account.
    *   `EMAIL_TO`: The email address where you want to receive emails from the contact form.
    *   `EMAIL_FROM`: An email address you have verified as a "Single Sender" in your SendGrid account.

4.  **Start the backend server:**
    ```bash
    node index.js
    ```
    The server will start on `http://localhost:3001`.

### 2. Frontend Setup

The frontend is a React application built with Vite.

1.  **Navigate to the `react-portfolio` directory:**
    ```bash
    cd react-portfolio
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the frontend development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:5173` (or another port if 5173 is in use).
