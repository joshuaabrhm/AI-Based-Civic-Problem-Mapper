# AI-Based Civic Problem Mapper

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![PyTorch](https://img.shields.io/badge/AI--Engine-PyTorch%20%2F%20CLIP%20%2F%20Whisper-EE4C2C?logo=pytorch&logoColor=white)](https://pytorch.org/)

An intelligent, full-stack civic reporting portal and government dashboard designed to streamline urban complaint management. Citizens can report infrastructure issues (using photo, text, or voice messages), while the AI-driven backend automatically labels categories, resolves duplicates, assesses priority, and drafts formal email complaints. Government officials use a unified inbox dashboard to inspect complaints, check AI insights, and finalize statuses.

---

## 🏛️ Project Architecture

The system is split into two main components:
- **`backend/`**: A FastAPI web server integrated with MongoDB, PyTorch (running CLIP & SBERT), OpenAI Whisper (running local speech transcription), and Ollama (for LLM formal draft generation).
- **`frontend/`**: A React application bootstrapped with Vite, styled using Tailwind CSS, and using Leaflet maps for geolocated issue plotting.

---

## 🧠 Core AI & Smart Features

The backend leverages desktop-class AI models running locally to ensure high quality and zero API costs:

1. **CLIP Image Classification (`ViT-B/32`)**
   * Automatically classifies issue photos into supported categories: *Garbage on Road*, *Waterlogging on Road*, *Streetlight Failure*, *Potholes on Road*, and *Broken Footpath*.
   * Detects and rejects invalid submissions (e.g. photos showing a "clear road" with no defects).

2. **Spatiotemporal Duplication Engine (CLIP Embeddings)**
   * Resolves the problem of multiple citizens reporting the same pothole or trash pile.
   * Compares incoming reports against unresolved grievances within a **100-meter radius**.
   * Computes the **cosine similarity** between CLIP vector embeddings of the new image and current master images. If similarity is **≥ 0.80**, the report is automatically linked as a duplicate of the existing ticket.

3. **Whisper Speech-to-Text Transcription (`small`)**
   * Transcribes voice complaints recorded by citizens in English, Hindi, and Kannada.
   * Auto-translates regional inputs into English to maintain consistent backend record-keeping.

4. **SBERT Semantic Impact Extraction (`all-MiniLM-L6-v2`)**
   * Performs semantic analysis on the citizen's verbal or written complaint.
   * Matches the report text with structured municipal impacts (e.g. mapping "cars are swerving to avoid it" -> "risk of accidents") using sentence similarity.

5. **LLM Email Draft Generation (Ollama + Llama 3.1:8b)**
   * Generates a formal, professionally written civic complaint letter addressed to Indian municipal corporations.
   * Follows strict rules: omits AI indicators (like "confidence score"), remains under 12 lines, attaches references to the photo proof, and adds citizen details in the footer.

6. **Smart Priority Indexing**
   * Automatically escalates issues based on severity factors, duplicate report volume (e.g. 4+ complaints raises status to High), and senior citizen indicators (boosts priority if reporter is ≥ 60 years old).

---

## 🚀 Setup & Installation

Follow these steps to configure and run the application locally.

### 📋 Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: v18 or higher (with `npm`)
- **Database**: MongoDB (running locally or via Atlas)
- **AI Models Environment**: We recommend a machine with a CUDA-enabled GPU for faster inference speeds, though CPU-only mode is supported.
- **Ollama**: Installed and running locally with the `llama3.1:8b` model pulled:
  ```bash
  ollama pull llama3.1:8b
  ```

---

### 💻 Backend Setup

1. **Navigate to the Backend Directory**:
   ```bash
   cd backend
   ```

2. **Create and Activate a Virtual Environment**:
   - On Windows:
     ```powershell
     python -m venv venv
     venv\Scripts\activate
     ```
   - On macOS/Linux:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install Dependencies**:
   First install PyTorch matching your hardware specifications (refer to [PyTorch installation generator](https://pytorch.org/get-started/locally/)).
   
   Then install the requirements:
   ```bash
   pip install fastapi uvicorn pymongo motor clip-by-openai sentence-transformers openai-whisper deep-translator requests pillow torch torchvision torchaudio numpy
   ```
   *(Ensure you have git installed on your system path, as `clip-by-openai` compiles directly from GitHub).*

4. **Configure Environment Variables**:
   Create a `.env` file in the `backend/` root or set the variables in your shell:
   ```env
   MONGO_URI=mongodb://localhost:27017
   MONGO_DB=community_problem_mapper
   UPLOAD_DIR=uploads
   OLLAMA_MODEL=llama3.1:8b
   OLLAMA_URL=http://localhost:11434/api/generate
   ```

5. **Start the API Server**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend documentation will be accessible at: `http://localhost:8000/docs`

---

### 🎨 Frontend Setup

1. **Navigate to the Frontend Directory**:
   ```bash
   cd ../frontend
   ```

2. **Install Packages**:
   ```bash
   npm install
   ```

3. **Configure API Client URL**:
   Ensure `frontend/src/api/client.js` is point to your running backend:
   ```javascript
   export const api = axios.create({
     baseURL: "http://localhost:8000", // or your custom network IP
     timeout: 60000,
   });
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser to view the application.

---

## 📡 API Reference Overview

Here are some of the main router paths defined in `backend/app/main.py`:

* **Authentication**:
  * `POST /auth/login` - Validates phone numbers. The system uses a specific administrator phone number `9999999999` to trigger the government dashboard role.
  * `POST /auth/register` - Registers citizens with name, age, and phone number.
* **Citizen Actions**:
  * `POST /citizen/submit` - Multipart submission for reports containing image, optional audio recording, text details, coordinates, and locality.
  * `GET /citizen/my-complaints` - Queries active and resolved reports.
  * `POST /citizen/cancel` - Allows citizens to retract a complaint (blocks cancellation if government has already resolved it).
  * `POST /citizen/delete` - Deletes reports and associated media file uploads.
* **Government Actions**:
  * `GET /gov/analytics` - Pulls analytics breakdown by categories and active/cancelled status counts.
  * `GET /gov/inbox_full` - Yields active master complaints, consolidated user reports list, and AI draft previews.
  * `PATCH /gov/complaint/{complaint_id}/status` - Sets issue progression (`unresolved` ➔ `fixed` / `rejected`).
  * `DELETE /gov/complaint/{complaint_id}` - Permanently purges a complaint record.

---

## 🛠️ Tech Stack Details

* **Map Overlay**: [Leaflet](https://leafletjs.com/) and [React Leaflet](https://react-leaflet.js.org/) for rendering interative pin mappings.
* **Database Geospatial Queries**: Utilizes MongoDB's `$near` spatial operators with `2dsphere` indexes to fetch regional overlaps within coordinates.
* **Styling**: Tailwind CSS with custom inputs, micro-animations, responsive cards, and dynamic state-badge colors.
