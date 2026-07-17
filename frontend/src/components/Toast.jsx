export default function Toast({ show, message, type = "success", onClose }) {
  if (!show) return null;

  const cls =
    type === "error"
      ? "bg-red-600"
      : type === "warning"
      ? "bg-yellow-600"
      : "bg-green-600";

  return (
    <div className="fixed top-5 right-5 z-[9999]">
      <div className={`px-4 py-3 rounded-2xl text-white font-bold shadow-lg ${cls}`}>
        <div className="flex items-center gap-3">
          <div>{message}</div>
          <button
            onClick={onClose}
            className="ml-2 px-2 py-1 rounded-xl bg-white/20 hover:bg-white/30"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
