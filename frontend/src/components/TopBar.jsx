import { useNavigate, useLocation } from "react-router-dom";

export default function TopBar({ title, hideActions = false }) {
  const nav = useNavigate();
  const loc = useLocation();
  const role = localStorage.getItem("role");

  function logout() {
    localStorage.removeItem("role");
    localStorage.removeItem("phone");
    localStorage.removeItem("name");
    localStorage.removeItem("age");
    nav("/");
  }

  const isLoginRoute = loc.pathname === "/";

  function openHowItWorks() {
    window.open("/gov/how-it-works", "_blank");
  }

  return (
    <div className="bg-white/80 backdrop-blur border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="text-lg font-extrabold text-gray-900">{title}</div>

        {!hideActions && !isLoginRoute && role && (
          <div className="flex gap-2 flex-wrap justify-end">
            {role === "citizen" && (
              <button
                onClick={() => nav("/my")}
                className="px-4 py-2 rounded-2xl bg-teal-600 text-white font-semibold hover:opacity-95"
              >
                My Complaints
              </button>
            )}

            {role === "government" && (
              <button
                onClick={openHowItWorks}
                className="px-4 py-2 rounded-2xl bg-emerald-600 text-white font-semibold hover:opacity-95"
              >
                How It Works
              </button>
            )}

            <button
              onClick={() => nav(-1)}
              className="px-4 py-2 rounded-2xl border font-semibold hover:bg-gray-50"
            >
              Back
            </button>

            <button
              onClick={logout}
              className="px-4 py-2 rounded-2xl bg-red-600 text-white font-semibold hover:opacity-95"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
