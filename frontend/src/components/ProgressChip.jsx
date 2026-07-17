export default function ProgressChip({ status }) {
  const s = (status || "unresolved").toLowerCase();

  const chip =
    s === "fixed"
      ? "bg-green-100 text-green-800 border-green-200"
      : s === "rejected"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-yellow-100 text-yellow-900 border-yellow-200";

  const pct = s === "unresolved" ? 30 : 100;

  return (
    <div>
      <div className={`inline-flex px-3 py-1 rounded-full border text-xs font-extrabold ${chip}`}>
        {s.toUpperCase()}
      </div>

      <div className="mt-2 w-full h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#2f8f7a]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-1 text-xs text-gray-500">
        Progress: <b>{pct}%</b>
      </div>
    </div>
  );
}
