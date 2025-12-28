"use client";

import * as React from "react";

type Props = {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
};

export function SearchBar({ value = "", placeholder = "Search listings…", onChange, onSubmit }: Props) {
  const [q, setQ] = React.useState(value);

  React.useEffect(() => setQ(value), [value]);

  return (
    <form
      className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(q.trim());
      }}
    >
      <input
        className="w-full bg-transparent text-sm outline-none"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          onChange?.(v);
        }}
        placeholder={placeholder}
        aria-label="Search"
      />
      <button
        type="submit"
        className="rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}

export default SearchBar;
