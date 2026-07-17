export default function ImageModal({ open, onClose, src, title }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title || "Preview"}</div>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <img className="modal-img" src={src} alt="preview" />
        </div>
      </div>
    </div>
  );
}
