import { useEffect, useMemo, useState } from "react";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import Skeleton from "../components/Skeleton";
import GovMapView from "../components/GovMapView";
import { formatDateTime } from "../utils/time";
import { apiGet, apiPatch, apiDelete } from "../api/client";

const STATUS_FILTERS = ["unresolved", "fixed", "rejected", "all"];

const CATEGORY_FILTERS = [
  "all",
  "Garbage on road",
  "Waterlogging on road",
  "Streetlight failure",
  "Potholes / damaged road",
  "Broken footpath",
];

export default function GovInbox() {
  const role = localStorage.getItem("role");

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({ open: false, type: "success", message: "" });

  const [statusFilter, setStatusFilter] = useState("unresolved");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [analytics, setAnalytics] = useState(null);

  const [view, setView] = useState("inbox"); // inbox | map

  // workspace toggles
  const [showInsights, setShowInsights] = useState(false);

  // image modal
  const [openImg, setOpenImg] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [imgTitle, setImgTitle] = useState("");

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId),
    [items, selectedId]
  );

  const filteredItems = useMemo(() => {
    return items
      .filter((x) => {
        const statusOk = statusFilter === "all" ? true : x.status === statusFilter;
        const catOk = categoryFilter === "all" ? true : x.category === categoryFilter;
        return statusOk && catOk;
      })
      .sort((a, b) => {
        const pr = { High: 3, Medium: 2, Low: 1 };
        const pa = pr[a.priority] ?? 0;
        const pb = pr[b.priority] ?? 0;
        if (pb !== pa) return pb - pa;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [items, statusFilter, categoryFilter]);

  async function loadAll() {
    setLoading(true);
    try {
      const [inboxRes, analyticsRes] = await Promise.all([
        apiGet("/gov/inbox_full"),
        apiGet("/gov/analytics"),
      ]);

      setItems(inboxRes || []);
      setAnalytics(analyticsRes || null);

      if (!selectedId && inboxRes?.length > 0) {
        setSelectedId(inboxRes[0].id);
      }
    } catch {
      setToast({
        open: true,
        type: "error",
        message: "Failed to load government dashboard. Check backend running.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!role) return;
    loadAll();
    // eslint-disable-next-line
  }, []);

  async function setStatus(newStatus) {
    if (!selected) return;

    // lock: once fixed/rejected, cannot change
    if (selected.status === "fixed" || selected.status === "rejected") {
      setToast({
        open: true,
        type: "error",
        message: "This complaint is already finalized. Status cannot be changed.",
      });
      return;
    }

    const ok = confirm(`Confirm: mark as "${newStatus.toUpperCase()}" ?`);
    if (!ok) return;

    try {
      await apiPatch(`/gov/complaint/${selected.id}/status`, { status: newStatus });
      setToast({ open: true, type: "success", message: `Updated → ${newStatus}` });
      await loadAll();
    } catch (e) {
      setToast({
        open: true,
        type: "error",
        message: e?.response?.data?.detail || "Failed to update status",
      });
    }
  }

  async function deleteComplaint() {
    if (!selected) return;
    const ok = confirm(
      "DELETE this complaint permanently?\n\nThis will wipe master + all duplicate reports + images/audio.\n\nThis cannot be undone."
    );
    if (!ok) return;

    try {
      await apiDelete(`/gov/complaint/${selected.id}`);
      setToast({ open: true, type: "success", message: "Deleted complaint successfully" });
      setSelectedId(null);
      await loadAll();
    } catch (e) {
      setToast({
        open: true,
        type: "error",
        message: e?.response?.data?.detail || "Delete failed",
      });
    }
  }

  async function copyEmail() {
    if (!selected?.email_draft) {
      setToast({ open: true, type: "error", message: "Email not available" });
      return;
    }
    await navigator.clipboard.writeText(selected.email_draft);
    setToast({ open: true, type: "success", message: "Copied email draft ✅" });
  }

  const badge = (p) => {
    const base =
      p === "High"
        ? "bg-red-100 text-red-700 border-red-200"
        : p === "Medium"
        ? "bg-yellow-100 text-yellow-700 border-yellow-200"
        : "bg-green-100 text-green-700 border-green-200";
    return `px-3 py-1 rounded-full border text-xs font-semibold ${base}`;
  };

  const statusChip = (s) => {
    const x = (s || "unresolved").toLowerCase();
    const cls =
      x === "fixed"
        ? "bg-green-100 text-green-800 border-green-200"
        : x === "rejected"
        ? "bg-red-100 text-red-800 border-red-200"
        : "bg-yellow-100 text-yellow-900 border-yellow-200";
    return `px-3 py-1 rounded-full border text-xs font-extrabold ${cls}`;
  };

  const progressPct = (s) => {
    const x = (s || "unresolved").toLowerCase();
    if (x === "unresolved") return 30;
    return 100;
  };

  return (
    <div className="min-h-screen bg-[#f4fbf7]">
      <TopBar title="Government Portal" />

      <Toast
        open={toast.open}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />

      <div className="max-w-7xl mx-auto px-5 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: Inbox */}
        <div className="bg-white border rounded-3xl shadow-sm p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-extrabold">Inbox</div>
              <div className="text-sm text-gray-500">Inbox view + map view</div>
            </div>

            <button
              onClick={loadAll}
              className="px-4 py-2 rounded-2xl bg-[#2f8f7a] text-white font-bold hover:opacity-90"
            >
              Refresh
            </button>
          </div>

          {/* Analytics */}
          <div className="mt-4 bg-[#f0fbf6] border rounded-3xl p-4">
            <div className="text-lg font-extrabold">Analytics</div>

            {!analytics && loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-6 w-full rounded-xl" />
                <Skeleton className="h-6 w-full rounded-xl" />
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="bg-white border rounded-2xl p-3">
                    <div className="text-xs text-gray-500">Total</div>
                    <div className="text-xl font-extrabold">{analytics?.total ?? 0}</div>
                  </div>
                  <div className="bg-white border rounded-2xl p-3">
                    <div className="text-xs text-gray-500">Unresolved</div>
                    <div className="text-xl font-extrabold">{analytics?.unresolved ?? 0}</div>
                  </div>
                  <div className="bg-white border rounded-2xl p-3">
                    <div className="text-xs text-gray-500">Fixed</div>
                    <div className="text-xl font-extrabold">{analytics?.fixed ?? 0}</div>
                  </div>
                  <div className="bg-white border rounded-2xl p-3">
                    <div className="text-xs text-gray-500">Rejected</div>
                    <div className="text-xl font-extrabold">{analytics?.rejected ?? 0}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-gray-600">
                  Reports: <b>{analytics?.reports?.total ?? 0}</b> • Active:{" "}
                  <b>{analytics?.reports?.active ?? 0}</b> • Cancelled:{" "}
                  <b>{analytics?.reports?.cancelled ?? 0}</b>
                </div>
              </>
            )}
          </div>

          {/* Toggle */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setView("inbox")}
              className={`flex-1 px-4 py-2 rounded-2xl border font-extrabold ${
                view === "inbox" ? "bg-[#2f8f7a] text-white border-[#2f8f7a]" : "bg-white"
              }`}
            >
              Inbox View
            </button>
            <button
              onClick={() => setView("map")}
              className={`flex-1 px-4 py-2 rounded-2xl border font-extrabold ${
                view === "map" ? "bg-[#2f8f7a] text-white border-[#2f8f7a]" : "bg-white"
              }`}
            >
              Map View
            </button>
          </div>

          {/* Filters */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-600 mb-1">Status Filter</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl border"
            >
              {STATUS_FILTERS.map((x) => (
                <option key={x} value={x}>
                  {x.toUpperCase()}
                </option>
              ))}
            </select>

            <div className="text-xs font-semibold text-gray-600 mb-1 mt-4">
              Category Filter
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl border"
            >
              {CATEGORY_FILTERS.map((x) => (
                <option key={x} value={x}>
                  {x.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Inbox list OR map */}
          <div className="mt-4">
            {loading && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-3xl" />
                <Skeleton className="h-24 w-full rounded-3xl" />
                <Skeleton className="h-24 w-full rounded-3xl" />
              </div>
            )}

            {!loading && view === "map" && (
              <GovMapView
                items={filteredItems}
                onSelect={(id) => {
                  setSelectedId(id);
                  setView("inbox");
                }}
              />
            )}

            {!loading && view === "inbox" && (
              <div className="space-y-3">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-gray-500">No complaints in this filter.</div>
                ) : (
                  filteredItems.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left p-4 rounded-3xl border hover:bg-gray-50 transition ${
                        selectedId === c.id ? "border-[#2f8f7a]" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-extrabold">{c.category}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            <b>Locality:</b> {c.locality || "N/A"}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Duplicates: <b>{c.duplicate_count ?? 0}</b> • Status:{" "}
                            <b>{c.status}</b>
                          </div>
                        </div>

                        <div className={badge(c.priority)}>{c.priority}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Workspace */}
        <div className="bg-white border rounded-3xl shadow-sm p-6 lg:col-span-2">
          <div>
            <div className="text-2xl font-extrabold">Workspace</div>
            <div className="text-sm text-gray-500">Review → then take action</div>
          </div>

          {loading && (
            <div className="mt-6 space-y-4">
              <Skeleton className="h-40 w-full rounded-3xl" />
              <Skeleton className="h-24 w-full rounded-3xl" />
              <Skeleton className="h-56 w-full rounded-3xl" />
            </div>
          )}

          {!loading && !selected && (
            <div className="mt-6 text-gray-500">Select a complaint from the inbox.</div>
          )}

          {!loading && selected && (
            <div className="mt-6 space-y-5">
              {/* Email */}
              <div className="bg-[#f0fbf6] border rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xl font-extrabold">Official Email Draft</div>
                    <div className="text-sm text-gray-600">
                      Copy and submit through official channels if required.
                    </div>
                  </div>

                  <button
                    onClick={copyEmail}
                    className="px-4 py-2 rounded-2xl bg-[#2f8f7a] text-white font-bold hover:opacity-90"
                  >
                    Copy Email
                  </button>
                </div>

                <div className="mt-4 bg-white border rounded-2xl p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {selected.email_draft || "Email not available"}
                  </pre>
                </div>
              </div>

              {/* Key info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="border rounded-3xl p-4">
                  <div className="text-xs text-gray-500">Complaint ID</div>
                  <div className="font-mono text-sm mt-1">{selected.id}</div>
                </div>

                <div className="border rounded-3xl p-4">
                  <div className="text-xs text-gray-500">Locality</div>
                  <div className="font-bold mt-1">{selected.locality || "N/A"}</div>
                </div>

                <div className="border rounded-3xl p-4">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="mt-2 inline-block">
                    <span className={statusChip(selected.status)}>{selected.status}</span>
                  </div>
                </div>

                <div className="border rounded-3xl p-4">
                  <div className="text-xs text-gray-500">Last Updated</div>
                  <div className="font-bold mt-1">{formatDateTime(selected.updated_at)}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="border rounded-3xl p-4">
                <div className="text-sm font-extrabold">Progress</div>
                <div className="mt-2 w-full h-3 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-[#2f8f7a] rounded-full"
                    style={{ width: `${progressPct(selected.status)}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {selected.status === "unresolved"
                    ? "Under review"
                    : selected.status === "fixed"
                    ? "Resolved"
                    : "Closed"}
                </div>
              </div>

              {/* Location + Photo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-3xl p-4">
                  <div className="text-lg font-extrabold">Exact Location</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Lat: {selected.lat ?? "N/A"} • Lon: {selected.lon ?? "N/A"}
                  </div>

                  {typeof selected.lat === "number" && typeof selected.lon === "number" && (
                    <a
                      className="mt-3 inline-block text-[#2f8f7a] font-bold underline"
                      href={`https://www.google.com/maps?q=${selected.lat},${selected.lon}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Google Maps
                    </a>
                  )}
                </div>

                <div className="border rounded-3xl p-4">
                  <div className="text-lg font-extrabold">Master Photo</div>

                  {selected.image_url ? (
                    <img
                      src={`http://192.168.1.132:8000${selected.image_url}`}
                      alt="master"
                      className="mt-3 w-full h-56 object-cover rounded-3xl border cursor-pointer"
                      onClick={() => {
                        setImgUrl(`http://192.168.1.132:8000${selected.image_url}`);
                        setImgTitle("Master Photo");
                        setOpenImg(true);
                      }}
                    />
                  ) : (
                    <div className="mt-3 text-gray-500">No image</div>
                  )}
                </div>
              </div>

              {/* Duplicate Reports - ALWAYS visible */}
              <div className="border rounded-3xl p-5">
                <div className="text-lg font-extrabold">
                  Duplicate Reports ({selected.reports?.length || 0})
                </div>
                <div className="text-sm text-gray-500">
                  All citizen submissions linked to this issue
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(selected.reports || []).map((r) => (
                    <div key={r.id} className="border rounded-3xl p-4 bg-gray-50">
                      <div className="text-xs text-gray-500">
                        Report ID: <span className="font-mono">{r.id}</span>
                      </div>

                      <div className="text-xs text-gray-500 mt-1">
                        Status: <b>{r.status}</b>
                      </div>

                      {r.image_url ? (
                        <img
                          src={`http://192.168.1.132:8000${r.image_url}`}
                          alt="dup"
                          className="mt-3 w-full h-40 object-cover rounded-3xl border cursor-pointer"
                          onClick={() => {
                            setImgUrl(`http://192.168.1.132:8000${r.image_url}`);
                            setImgTitle("Duplicate Report Photo");
                            setOpenImg(true);
                          }}
                        />
                      ) : (
                        <div className="mt-3 text-sm text-gray-500">No image</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Deeper insights - ONLY citizen text/audio */}
              <div className="border rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-extrabold">View deeper insights</div>
                    <div className="text-sm text-gray-500">
                      Demo-only: citizen notes + audio
                    </div>
                  </div>

                  <button
                    onClick={() => setShowInsights((x) => !x)}
                    className="px-4 py-2 rounded-2xl border font-bold hover:bg-gray-50"
                  >
                    {showInsights ? "Hide" : "Show"}
                  </button>
                </div>

                {showInsights && (
                  <div className="mt-4 space-y-3">
                    {(selected.insights_reports || []).length === 0 ? (
                      <div className="text-sm text-gray-500">
                        No active citizen inputs available.
                      </div>
                    ) : (
                      (selected.insights_reports || []).map((r) => (
                        <div key={r.id} className="bg-white border rounded-2xl p-4">
                          <div className="text-xs text-gray-500">
                            Citizen Phone: <span className="font-mono">{r.phone}</span>
                          </div>

                          <div className="mt-2">
                            <div className="text-xs text-gray-500">Citizen Text</div>
                            <div className="mt-1 font-semibold text-gray-800">
                              {r.text ? r.text : <span className="text-gray-400">No text</span>}
                            </div>
                          </div>

                          {r.audio_url ? (
                            <div className="mt-3">
                              <div className="text-xs text-gray-500">Citizen Audio</div>
                              <audio
                                className="mt-2 w-full"
                                controls
                                src={`http://192.168.1.132:8000${r.audio_url}`}
                              />
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-gray-500">
                              No audio attached.
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border rounded-3xl p-5">
                <div className="text-lg font-extrabold">Actions</div>
                <div className="text-sm text-gray-500">
                  Take action only after reviewing email + photo
                </div>

                <div className="mt-4 flex flex-col md:flex-row gap-3">
                  <button
                    disabled={selected.status !== "unresolved"}
                    onClick={() => setStatus("fixed")}
                    className="px-5 py-3 rounded-2xl bg-green-600 text-white font-extrabold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Mark Fixed
                  </button>

                  <button
                    disabled={selected.status !== "unresolved"}
                    onClick={() => setStatus("rejected")}
                    className="px-5 py-3 rounded-2xl bg-red-600 text-white font-extrabold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reject
                  </button>

                  <button
                    disabled={selected.status !== "unresolved"}
                    onClick={() => setStatus("unresolved")}
                    className="px-5 py-3 rounded-2xl border font-extrabold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Keep Unresolved
                  </button>

                  <button
                    onClick={deleteComplaint}
                    className="px-5 py-3 rounded-2xl border font-extrabold hover:bg-red-50 text-red-700"
                  >
                    Delete (Wipe)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={openImg} onClose={() => setOpenImg(false)} title={imgTitle}>
        <img src={imgUrl} alt="preview" className="w-full rounded-2xl border" />
      </Modal>
    </div>
  );
}
