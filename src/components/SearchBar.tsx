import React from "react";

export default function SearchBar({
  value,
  onChange,
  onSearch
}: {
  value: string;
  onChange: (s: string) => void;
  onSearch?: () => void;
}) {
  return (
    <div className="flex gap-2 w-full sm:w-auto">
      <input
        className="input"
        placeholder="Search ticker (e.g. AAPL)"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === 'Enter' && onSearch) onSearch(); }}
      />
      <button className="btn" onClick={onSearch}>Search</button>
    </div>
  );
}
