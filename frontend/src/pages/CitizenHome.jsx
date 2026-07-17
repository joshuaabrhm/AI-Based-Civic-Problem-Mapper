import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import MapPicker from "../components/MapPicker";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import LanguageHint from "../components/LanguageHint";
import { apiGet, apiPostForm } from "../api/client";

const MAX_RADIUS_METERS = 1000;

function toRad(x) {
  return (x * Math.PI) / 180;
}

// Haversine distance in meters
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// clamp a point to a circle boundary if outside
function clampToRadius(centerLat, centerLon, lat, lon, radiusMeters) {
  const d = distanceMeters(centerLat, centerLon, lat, lon);
  if (d <= radiusMeters) return { lat, lon, clamped: false };

  // Move point towards center along bearing
  const φ1 = toRad(centerLat);
  const φ2 = toRad(lat);
  const Δλ = toRad(lon - centerLon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const bearing = Math.atan2(y, x);

  // Destination point from center with distance=radius
  const R = 6371000;
  const δ = radiusMeters / R;

  const φ3 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing)
  );

  const λ1 = toRad(centerLon);
  const λ3 =
    λ1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ3)
    );

  const newLat = (φ3 * 180) / Math.PI;
  const newLon = (λ3 * 180) / Math.PI;

  return { lat: newLat, lon: newLon, clamped: true };
}

export default function CitizenHome() {
  const nav = useNavigate();
  const role = localStorage.getItem("role");
  const phone = localStorage.getItem("phone");

  // location states
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);

  // center = user's current location (for radius restriction)
  const [centerLat, setCenterLat] = useState(null);
  const [centerLon, setCenterLon] = useState(null);

  const [locationLocked, setLocationLocked] = useState(true);

  // locality
  const [locality, setLocality] = useState("");
  const [localityLocked, setLocalityLocked] = useState(true);
  const [localityLoading, setLocalityLoading] = useState(false);

  // input mode
  const [mode, setMode] = useState("text"); // text | voice

  // text/audio
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcribeLang, setTranscribeLang] = useState("");

  // NEW: transcribing indicator
  const [transcribing, setTranscribing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // image upload
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [openImg, setOpenImg] = useState(false);

  // ui
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({
    open: false,
    type: "success",
    message: "",
  });

  // NEW: obvious submit popup
  const [submitPopup, setSubmitPopup] = useState({
    open: false,
    type: "success", // success | error
    title: "",
    message: "",
  });

  const canSubmit = useMemo(() => {
    return (
      !!imageFile &&
      typeof lat === "number" &&
      typeof lon === "number" &&
      !!locality
    );
  }, [imageFile, lat, lon, locality]);

  useEffect(() => {
    if (!role) nav("/");
    if (role !== "citizen") nav("/gov");
    // eslint-disable-next-line
  }, []);

  async function reverseGeocode(a, b) {
    setLocalityLoading(true);

    // while locked, never show empty
    if (localityLocked) {
      setLocality((prev) =>
        prev && prev.trim() ? prev : "Detecting locality..."
      );
    }

    try {
      const res = await apiGet(`/geo/reverse?lat=${a}&lon=${b}`);
      const place = (res?.locality || "").trim();

      if (localityLocked) {
        setLocality(place || "Unknown locality");
      }
    } catch {
      if (localityLocked) setLocality("Unknown locality");
    } finally {
      setLocalityLoading(false);
    }
  }

  function setMarkerWithRadiusGuard(a, b, showToast = true) {
    if (centerLat == null || centerLon == null) {
      setLat(a);
      setLon(b);
      reverseGeocode(a, b);
      return;
    }

    const clamped = clampToRadius(centerLat, centerLon, a, b, MAX_RADIUS_METERS);
    setLat(clamped.lat);
    setLon(clamped.lon);

    if (clamped.clamped && showToast) {
      setToast({
        open: true,
        type: "error",
        message: "You can report only within 1km of your current location.",
      });
    }

    reverseGeocode(clamped.lat, clamped.lon);
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setToast({ open: true, type: "error", message: "Geolocation not supported" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const a = pos.coords.latitude;
        const b = pos.coords.longitude;

        setCenterLat(a);
        setCenterLon(b);

        setMarkerWithRadiusGuard(a, b, false);

        setToast({
          open: true,
          type: "success",
          message: "Current location detected ✅",
        });
      },
      () => {
        setToast({
          open: true,
          type: "error",
          message: "Location permission denied / unavailable",
        });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  useEffect(() => {
    useCurrentLocation();
    // eslint-disable-next-line
  }, []);

  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      chunksRef.current = [];
      const mr = new MediaRecorder(stream);

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        await transcribeAudio(blob);
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);

      setToast({ open: true, type: "success", message: "Recording started 🎙️" });
    } catch {
      setToast({ open: true, type: "error", message: "Microphone permission denied" });
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.stop();
    setRecording(false);

    try {
      mr.stream.getTracks().forEach((t) => t.stop());
    } catch {}
  }

  async function transcribeAudio(blob) {
    setTranscript("");
    setTranscribeLang("");
    setTranscribing(true);

    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");

      const res = await fetch("http://192.168.1.132:8000/ai/transcribe", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      const t = (data?.text || "").trim();
      const lang = (data?.language || "").trim();

      setTranscript(t);
      setTranscribeLang(lang);

      if (t) setText(t);

      setToast({ open: true, type: "success", message: "Transcription done ✅" });
    } catch {
      setToast({ open: true, type: "error", message: "Transcription failed" });
    } finally {
      setTranscribing(false);
    }
  }

  function resetForm() {
    setText("");
    setAudioBlob(null);
    setAudioUrl("");
    setTranscript("");
    setTranscribeLang("");
    setImageFile(null);
    setImagePreview("");
  }

  async function submitComplaint() {
    if (!phone) {
      setToast({ open: true, type: "error", message: "Login required" });
      return;
    }

    if (transcribing) {
      setToast({
        open: true,
        type: "error",
        message: "Please wait, audio is still transcribing...",
      });
      return;
    }

    if (!canSubmit) {
      setToast({
        open: true,
        type: "error",
        message: "Please select location + photo + locality",
      });
      return;
    }

    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("phone", phone);
      fd.append("lat", String(lat));
      fd.append("lon", String(lon));
      fd.append("locality", locality || "Unknown locality");
      fd.append("input_mode", mode);

      if (mode === "text") {
        fd.append("text", text || "");
      } else {
        fd.append("text", text || transcript || "");
        if (audioBlob) fd.append("audio", audioBlob, "voice.webm");
      }

      fd.append("image", imageFile);

      await apiPostForm("/citizen/submit", fd);

      // POPUP (obvious)
      setSubmitPopup({
        open: true,
        type: "success",
        title: "Complaint Submitted ✅",
        message: "Complaint successfully registered. Go to My Complaints to view.",
      });

      resetForm();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Submit failed";

      // POPUP (obvious)
      setSubmitPopup({
        open: true,
        type: "error",
        title: "Complaint Not Submitted ❌",
        message: msg,
      });

      setToast({
        open: true,
        type: "error",
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4fbf7]">
      <TopBar title="Citizen Portal" />

      <Toast
        open={toast.open}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />

      {/* Submit Result Popup */}
      <Modal
        open={submitPopup.open}
        onClose={() => setSubmitPopup((p) => ({ ...p, open: false }))}
        title={submitPopup.title}
      >
        <div
          className={`p-4 rounded-2xl border font-semibold ${
            submitPopup.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {submitPopup.message}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setSubmitPopup((p) => ({ ...p, open: false }))}
            className="px-4 py-2 rounded-2xl bg-black text-white font-extrabold hover:opacity-90"
          >
            OK
          </button>

          {submitPopup.type === "success" && (
            <button
              onClick={() => nav("/my")}
              className="px-4 py-2 rounded-2xl border font-extrabold hover:bg-gray-50"
            >
              Go to My Complaints
            </button>
          )}
        </div>
      </Modal>

      <div className="max-w-4xl mx-auto px-5 py-6 space-y-5">
        {/* Map block */}
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold">Confirm Location</div>
              <div className="text-sm text-gray-500">
                Tap “Use Current Location” and confirm marker (restricted to 1km).
              </div>
            </div>

            <button
              onClick={useCurrentLocation}
              className="px-4 py-2 rounded-2xl bg-[#2f8f7a] text-white font-bold hover:opacity-90"
            >
              Use Current Location
            </button>
          </div>

          <div className="mt-4">
            <MapPicker
              lat={lat}
              lon={lon}
              centerLat={centerLat}
              centerLon={centerLon}
              radiusMeters={MAX_RADIUS_METERS}
              locked={locationLocked}
              onChange={(a, b) => {
                if (locationLocked) return;
                setMarkerWithRadiusGuard(a, b, true);
              }}
              onMarkerDrag={(a, b) => {
                if (locationLocked) return;
                setMarkerWithRadiusGuard(a, b, true);
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <b>Lat:</b> {typeof lat === "number" ? lat.toFixed(6) : "—"} •{" "}
              <b>Lon:</b> {typeof lon === "number" ? lon.toFixed(6) : "—"}
            </div>

            <button
              onClick={() => setLocationLocked((x) => !x)}
              className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50"
            >
              {locationLocked ? "Unlock Marker" : "Lock Marker"}
            </button>
          </div>
        </div>

        {/* Locality block */}
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold">Locality / Area</div>
              <LanguageHint
                en="Auto-filled from map (can edit if unlocked)"
                kn="ಮ್ಯಾಪ್‌ನಿಂದ ಸ್ವಯಂಚಾಲಿತ (ಅನ್‌ಲಾಕ್ ಮಾಡಿದರೆ ಬದಲಾಯಿಸಬಹುದು)"
                hi="मैप से ऑटो (अनलॉक करने पर बदल सकते हैं)"
              />
            </div>

            <button
              onClick={() => setLocalityLocked((x) => !x)}
              className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50"
            >
              {localityLocked ? "Unlock" : "Lock"}
            </button>
          </div>

          <input
            value={locality}
            disabled={localityLocked}
            onChange={(e) => setLocality(e.target.value)}
            placeholder="Enter area / landmark"
            className={`mt-3 w-full px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-teal-300 ${
              localityLocked ? "bg-gray-100 cursor-not-allowed" : "bg-white"
            }`}
          />

          <div className="mt-2 text-xs text-gray-500">
            {localityLoading
              ? "Detecting locality..."
              : localityLocked
              ? "Locked ✅"
              : "Editable"}
          </div>
        </div>

        {/* Upload photo */}
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="text-xl font-extrabold">Upload Photo (Required)</div>
          <div className="text-sm text-gray-500">
            Clear photo improves category detection accuracy.
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="mt-4 w-full"
          />


          {imagePreview && (
            <div className="mt-4">
              <img
                src={imagePreview}
                alt="preview"
                className="w-full h-64 object-cover rounded-3xl border cursor-pointer"
                onClick={() => setOpenImg(true)}
              />
              <div className="mt-2 text-xs text-gray-500">
                Click image to view larger
              </div>
            </div>
          )}
        </div>

        {/* Text / Voice tabs */}
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="text-xl font-extrabold">Issue Description</div>

          {/* RESTORED: Kannada + Hindi hints */}
          <LanguageHint
            en="Provide details via text or voice (Hindi / Kannada / English supported)."
            kn="ವಿವರಗಳನ್ನು ಪಠ್ಯ ಅಥವಾ ಧ್ವನಿಯಲ್ಲಿ ನೀಡಿ (ಹಿಂದಿ / ಕನ್ನಡ / ಇಂಗ್ಲಿಷ್ ಬೆಂಬಲಿತ)."
            hi="विवरण टेक्स्ट या आवाज़ में दें (हिंदी / कन्नड़ / अंग्रेज़ी समर्थित)।"
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setMode("text")}
              className={`flex-1 px-4 py-2 rounded-2xl border font-extrabold ${
                mode === "text"
                  ? "bg-[#2f8f7a] text-white border-[#2f8f7a]"
                  : "bg-white"
              }`}
            >
              Text
            </button>

            <button
              onClick={() => setMode("voice")}
              className={`flex-1 px-4 py-2 rounded-2xl border font-extrabold ${
                mode === "voice"
                  ? "bg-[#2f8f7a] text-white border-[#2f8f7a]"
                  : "bg-white"
              }`}
            >
              Voice
            </button>
          </div>

          {mode === "text" && (
            <div className="mt-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Example: Water is stagnant and bikes are slipping near RV College gate."
                className="w-full min-h-[120px] px-4 py-3 rounded-2xl border focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </div>
          )}

          {mode === "voice" && (
            <div className="mt-4 bg-[#f0fbf6] border rounded-3xl p-4">
              <div className="font-extrabold">Record Audio</div>
              <div className="text-sm text-gray-600">
                Press Start → Speak → Stop
              </div>

              <div className="mt-3 flex gap-3">
                {!recording ? (
                  <button
                    onClick={startRecording}
                    className="px-4 py-2 rounded-2xl bg-[#2f8f7a] text-white font-bold hover:opacity-90"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="px-4 py-2 rounded-2xl bg-red-600 text-white font-bold hover:opacity-90"
                  >
                    Stop
                  </button>
                )}

                <button
                  onClick={() => {
                    setAudioBlob(null);
                    setAudioUrl("");
                    setTranscript("");
                    setTranscribeLang("");
                    setText("");
                  }}
                  className="px-4 py-2 rounded-2xl border font-bold hover:bg-white"
                >
                  Clear
                </button>
              </div>

              {transcribing && (
                <div className="mt-3 text-sm font-semibold text-gray-700">
                  ⏳ Transcribing... please wait
                </div>
              )}

              {audioUrl && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 font-semibold">Playback</div>
                  <audio controls className="mt-1 w-full" src={audioUrl} />
                </div>
              )}

              <div className="mt-4">
                <div className="text-xs text-gray-500 font-semibold">
                  Transcript {transcribeLang ? `(${transcribeLang})` : ""}
                </div>
                <div className="mt-2 bg-white border rounded-2xl p-3 min-h-[52px]">
                  {transcript || (
                    <span className="text-gray-400">
                      Transcript will appear here after recording.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="bg-white border rounded-3xl shadow-sm p-5">
          <div className="flex flex-col md:flex-row gap-3">
            <button
              disabled={!canSubmit || submitting || transcribing}
              onClick={submitComplaint}
              className="flex-1 px-5 py-4 rounded-2xl bg-black text-white font-extrabold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? "Submitting..."
                : transcribing
                ? "Transcribing..."
                : "Submit Complaint"}
            </button>

            <button
              onClick={() => nav("/my")}
              className="px-5 py-4 rounded-2xl border font-extrabold hover:bg-gray-50"
            >
              My Complaints
            </button>
          </div>

          {!canSubmit && (
            <div className="mt-3 text-sm text-gray-500">
              Required: location + photo + locality
            </div>
          )}
        </div>
      </div>

      <Modal open={openImg} onClose={() => setOpenImg(false)} title="Photo Preview">
        <img src={imagePreview} alt="full" className="w-full rounded-2xl border" />
      </Modal>
    </div>
  );
}
