export default function LanguageHint({ en, kn, hi }) {
  return (
    <div className="mt-1 leading-snug">
      {en && <div className="text-sm text-gray-700">{en}</div>}
      <div className="text-sm text-gray-600 font-medium">
        {kn ? <span className="mr-2">{kn}</span> : null}
        {hi ? <span className="mr-2">{hi}</span> : null}
      </div>
    </div>
  );
}
