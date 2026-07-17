import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api/client";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { formatDateTime } from "../utils/time";

// 🔥 Simple in-file progress bar (no imports, no crashes)
function PriorityBar({ priority }) {
  const p = (priority || "Low").toLowerCase();

  let pct = 33;
  let label = "Low";
  let trackCls = "bg-gray-200";
  let fillCls = "bg-green-500";

  if (p === "medium") {
    pct = 66;
    label = "Medium";
    fillCls = "bg-yellow-500";
  } else if (p === "high") {
    pct = 100;
    label = "High";
    fillCls = "bg-red-500";
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-bold text-gray-600">
        <span>Severity</span>
        <span>{label}</span>
      </div>

      <div className={`mt-1 w-full h-2 rounded-full ${trackCls} overflow-hidden`}>
        <div
          className={`h-2 rounded-full ${fillCls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MyComplaints() {
  const phone = localStorage.getItem("phone") || "";
  const role = localStorage.getItem("role") || "";

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  const [openImg, setOpenImg] = useState(false);
  const [imgUrl, setImgUrl] = useState("");

  const [toast, setToast] = useState({ open: false, type: "success", msg: "" });

  function showToast(type, msg) {
    setToast({ open: true, type, msg });
  }

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await apiGet(`/citizen/my-complaints?phone=${phone}`);
      setItems(res || []);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load complaints");
    } finally {
      setLoading(false);
    }
  }

  async function cancelComplaint(reportId, masterStatus) {
    if (masterStatus === "fixed" || masterStatus === "rejected") {
      showToast("error", "Cannot cancel after government action.");
      return;
    }

    const ok = confirm(
      "Cancel this complaint?\n\nThis will reduce duplicates count and update severity.\n\n/ शिकायत रद्द करें?\n/ ದೂರು ರದ್ದುಪಡಿಸಬೇಕಾ?"
    );
    if (!ok) return;

    try {
      await apiPost(`/citizen/cancel`, { phone, report_id: reportId });
      await load();
      showToast("success", "Cancelled successfully ✅");
    } catch (e) {
      showToast("error", e?.response?.data?.detail || "Cancel failed");
    }
  }

  async function deleteReport(reportId, reportStatus) {
    if (reportStatus !== "cancelled") {
      showToast("error", "Cancel first, then delete.");
      return;
    }

    const ok = confirm(
      "DELETE this complaint report permanently?\n\nThis cannot be undone."
    );
    if (!ok) return;

    try {
      await apiPost(`/citizen/report/${reportId}/delete?phone=${phone}`, {});
      await load();
      showToast("success", "Deleted successfully ✅");
    } catch (e) {
      showToast("error", e?.response?.data?.detail || "Delete failed");
    }
  }

  useEffect(() => {
    if (!phone || role !== "citizen") return;
    load();
    // eslint-disable-next-line
  }, []);

  const statusBadge = (masterStatus, reportStatus) => {
    if (reportStatus === "cancelled")
      return "bg-gray-100 border-gray-200 text-gray-700";

    if (masterStatus === "fixed")
      return "bg-green-100 border-green-200 text-green-700";
    if (masterStatus === "rejected")
      return "bg-red-100 border-red-200 text-red-700";

    return "bg-yellow-100 border-yellow-200 text-yellow-800";
  };

  const statusText = (masterStatus, reportStatus) => {
    if (reportStatus === "cancelled") return "Cancelled";
    if (masterStatus === "fixed") return "Fixed";
    if (masterStatus === "rejected") return "Rejected";
    return "Active";
  };

  const cardTint = (masterStatus) => {
    if (masterStatus === "fixed") return "border-green-200 bg-green-50";
    if (masterStatus === "rejected") return "border-red-200 bg-red-50";
    return "border-gray-200 bg-white";
  };

  const sorted = useMemo(() => {
    const rank = { Active: 3, Fixed: 2, Rejected: 1, Cancelled: 0 };
    return [...items].sort((a, b) => {
      const ra = rank[statusText(a.master_status, a.report_status)] ?? 0;
      const rb = rank[statusText(b.master_status, b.report_status)] ?? 0;
      if (rb !== ra) return rb - ra;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [items]);

  if (!phone || role !== "citizen") {
    return (
      <div className="min-h-screen">
        <TopBar title="My Complaints" />
        <div className="max-w-xl mx-auto px-4 py-10">
          <div className="bg-white border rounded-2xl p-6">
            Please login as citizen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4fbf7]">
      <TopBar title="My Complaints" />

      <Toast
        open={toast.open}
        type={toast.type}
        msg={toast.msg}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={load}
            className="px-4 py-2 rounded-2xl bg-teal-600 text-white font-bold hover:opacity-90"
          >
            Refresh
          </button>

          {loading && <div className="text-sm text-gray-600">Loading...</div>}
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border text-red-700 font-semibold">
            {err}
          </div>
        )}

        {sorted.length === 0 && !loading ? (
          <div className="bg-white border rounded-2xl p-6">
            <div className="text-lg font-extrabold">No complaints yet</div>
            <div className="text-gray-600 mt-2">Submit from Home page.</div>
          </div>
        ) : (
          <div className="grid gap-4">
            {sorted.map((c) => {
              const badgeCls = statusBadge(c.master_status, c.report_status);
              const st = statusText(c.master_status, c.report_status);

              return (
                <div
                  key={c.report_id}
                  className={`border rounded-2xl shadow-sm p-5 ${cardTint(
                    c.master_status
                  )}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500">
                        Complaint ID:{" "}
                        <span className="font-mono">
                          {c.complaint_code || c.master_complaint_id}
                        </span>
                      </div>

                      <div className="text-xl font-extrabold mt-1">
                        {c.category || "Unknown"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <span
                          className={`px-3 py-1 rounded-full border text-xs font-extrabold ${badgeCls}`}
                        >
                          {st}
                        </span>

                        <span className="px-3 py-1 rounded-full border text-xs font-bold bg-white">
                          Priority: {c.priority || "Low"}
                        </span>

                        <span className="px-3 py-1 rounded-full border text-xs font-bold bg-white">
                          Duplicates: {c.duplicate_count ?? 0}
                        </span>
                      </div>

                      {/* ✅ RESTORED: Severity/Progress Bar */}
                      <PriorityBar priority={c.priority} />

                      <div className="text-sm text-gray-700 mt-2">
                        <b>Locality:</b> {c.locality || "N/A"}
                      </div>

                      <div className="text-xs text-gray-600 mt-1">
                        <b>Last Updated:</b> {formatDateTime(c.updated_at)}
                      </div>

                      {c.image_url && (
                        <button
                          onClick={() => {
                            setImgUrl(`http://192.168.1.132:8000${c.image_url}`);
                            setOpenImg(true);
                          }}
                          className="mt-2 underline text-teal-700 font-semibold"
                        >
                          View photo
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <button
                        disabled={
                          c.report_status === "cancelled" ||
                          c.master_status === "fixed" ||
                          c.master_status === "rejected"
                        }
                        onClick={() =>
                          cancelComplaint(c.report_id, c.master_status)
                        }
                        className="px-4 py-2 rounded-2xl bg-red-600 text-white font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {c.report_status === "cancelled" ? "Cancelled" : "Cancel"}
                      </button>

                      <button
                        disabled={c.report_status !== "cancelled"}
                        onClick={() => deleteReport(c.report_id, c.report_status)}
                        className="px-4 py-2 rounded-2xl bg-black text-white font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={openImg}
        onClose={() => setOpenImg(false)}
        title="Complaint Photo"
      >
        <img src={imgUrl} alt="complaint" className="w-full rounded-2xl border" />
      </Modal>
    </div>
  );
}
