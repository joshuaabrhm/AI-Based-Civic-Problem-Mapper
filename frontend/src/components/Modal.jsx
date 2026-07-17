export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-bold">{title}</div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-xl border hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
