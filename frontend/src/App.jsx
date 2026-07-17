import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";

import Login from "./pages/Login.jsx";
import CitizenHome from "./pages/CitizenHome.jsx";
import MyComplaints from "./pages/MyComplaints.jsx";
import GovInbox from "./pages/GovInbox.jsx";

const HowItWorks = lazy(() => import("./pages/HowItWorks.jsx"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#f4fbf7] flex items-center justify-center">
      <div className="bg-white border rounded-3xl shadow-sm p-6 text-gray-700 font-bold">
        Loading...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route path="/citizen" element={<CitizenHome />} />
        <Route path="/my" element={<MyComplaints />} />

        <Route path="/gov" element={<GovInbox />} />

        <Route
          path="/gov/how-it-works"
          element={
            <Suspense fallback={<PageLoader />}>
              <HowItWorks />
            </Suspense>
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
