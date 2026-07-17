import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import TopBar from "../components/TopBar";
import LanguageHint from "../components/LanguageHint";
import { apiPost } from "../api/client";

const GOV_PHONE = "9999999999";

export default function Login() {
  const nav = useNavigate();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // UI mode is derived automatically
  const isGovPhone = useMemo(() => phone.trim() === GOV_PHONE, [phone]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "citizen") nav("/citizen");
    if (role === "government") nav("/gov");
  }, [nav]);

  function resetSession() {
    localStorage.removeItem("role");
    localStorage.removeItem("phone");
    localStorage.removeItem("name");
    localStorage.removeItem("age");
  }

  function saveSession(res) {
    localStorage.setItem("role", res.role);
    localStorage.setItem("phone", res.phone);
    localStorage.setItem("name", res.name || "");
    localStorage.setItem("age", res.age !== null && res.age !== undefined ? String(res.age) : "");
  }

  async function doLogin(phoneNumber) {
    const res = await apiPost("/auth/login", { phone: phoneNumber });

    // NEW BACKEND CONTRACT:
    // If user doesn't exist, backend returns: { needs_register: true }
    if (res?.needs_register) {
      return { needs_register: true };
    }

    saveSession(res);

    if (res.role === "government") nav("/gov");
    else nav("/citizen");

    return { ok: true };
  }

  async function doRegisterAndLogin() {
    const p = phone.trim();
    const n = name.trim();
    const a = age.trim();

    if (p.length !== 10 || !/^\d+$/.test(p)) {
      setMsg("Enter a valid 10-digit phone number.");
      return;
    }

    if (p === GOV_PHONE) {
      setMsg("Government number cannot be registered. Just login.");
      return;
    }

    if (!n) {
      setMsg("Enter your name.");
      return;
    }

    if (!a || !/^\d+$/.test(a)) {
      setMsg("Enter a valid age.");
      return;
    }

    setLoading(true);
    try {
      // register
      await apiPost("/auth/register", {
        phone: p,
        name: n,
        age: Number(a),
      });

      // then login
      resetSession();
      await doLogin(p);
    } catch (e) {
      const detail = e?.response?.data?.detail || "";
      setMsg(detail || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginClick() {
    setMsg("");

    const p = phone.trim();
    if (p.length !== 10 || !/^\d+$/.test(p)) {
      setMsg("Enter a valid 10-digit phone number.");
      return;
    }

    setLoading(true);
    try {
      resetSession();

      // Government always goes directly
      if (p === GOV_PHONE) {
        await doLogin(p);
        return;
      }

      const res = await doLogin(p);

      // If backend says needs register -> do it automatically
      if (res?.needs_register) {
        setMsg("New user detected. Please enter Name + Age to continue.");
      }
    } catch (e) {
      const detail = e?.response?.data?.detail || "";
      setMsg(detail || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  const showRegisterFields = !isGovPhone && msg.toLowerCase().includes("new user");

  return (
    <div className="min-h-screen bg-[#f3fbf7]">
      <TopBar title="Community Problem Mapper" hideActions />

      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white border rounded-3xl shadow-sm p-6">
          <div className="text-2xl font-extrabold">
            {isGovPhone ? "Government Login" : "Citizen Login"}
          </div>

          <div className="mt-1 text-sm text-gray-600">
            <LanguageHint
              en="Citizen / Government access"
              kn="ನಾಗರಿಕ / ಸರ್ಕಾರ"
              hi="नागरिक / सरकार"
            />
          </div>

          <div className="mt-6 space-y-4">
            {/* PHONE */}
            <div>
              <label className="text-sm font-semibold">Phone</label>
              <div className="text-xs text-gray-500">
                <LanguageHint
                  en="Enter 10 digit number"
                  kn="10 ಅಂಕಿಯ ಸಂಖ್ಯೆ"
                  hi="10 अंकों का नंबर"
                />
              </div>

              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setMsg(""); // important: clear old errors when typing
                }}
                placeholder="9876543210"
                className="mt-2 w-full px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />

              <div className="mt-2 text-xs text-gray-500">
                Government phone: <b>{GOV_PHONE}</b>
              </div>

              {/* THIS IS THE OLD BEHAVIOR YOU WANTED BACK */}
              <div className="mt-1 text-xs font-semibold text-emerald-700">
                {isGovPhone
                  ? "Detected Government number → Login as Government"
                  : "Citizen number → Login as Citizen"}
              </div>
            </div>

            {/* AUTO REGISTER FIELDS */}
            {!isGovPhone && showRegisterFields && (
              <>
                <div>
                  <label className="text-sm font-semibold">Name</label>
                  <div className="text-xs text-gray-500">
                    <LanguageHint en="Full name" kn="ಹೆಸರು" hi="नाम" />
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="mt-2 w-full px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Age</label>
                  <div className="text-xs text-gray-500">
                    <LanguageHint en="Age in years" kn="ವಯಸ್ಸು" hi="उम्र" />
                  </div>
                  <input
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="18"
                    className="mt-2 w-full px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                </div>
              </>
            )}

            {/* MESSAGE */}
            {msg && (
              <div className="text-sm bg-yellow-50 border border-yellow-200 p-3 rounded-2xl">
                {msg}
              </div>
            )}

            {/* BUTTONS */}
            {!showRegisterFields ? (
              <button
                disabled={loading}
                onClick={handleLoginClick}
                className={`w-full px-4 py-3 rounded-2xl font-bold hover:opacity-95 disabled:opacity-60 ${
                  isGovPhone ? "bg-black text-white" : "bg-emerald-600 text-white"
                }`}
              >
                {loading ? "Please wait..." : isGovPhone ? "Login as Government" : "Login"}
              </button>
            ) : (
              <button
                disabled={loading}
                onClick={doRegisterAndLogin}
                className="w-full px-4 py-3 rounded-2xl bg-emerald-600 text-white font-bold hover:opacity-95 disabled:opacity-60"
              >
                {loading ? "Registering..." : "Register & Continue"}
              </button>
            )}

            <div className="text-xs text-gray-500 text-center pt-2">
              Demo build • pastel theme • Kannada + Hindi hints
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
