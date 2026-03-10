"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface SearchInputProps {
  placeholder?: string;
  onChange: (value: string) => void;
  defaultValue?: string;
  className?: string;
}

export default function SearchInput({
  placeholder = "Search...",
  onChange,
  defaultValue = "",
  className = "",
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onChange(val);
      }, 300);
    },
    [onChange]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          debouncedOnChange(e.target.value);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-2.5 pl-10 text-sm text-text-primary placeholder-text-muted outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)]"
      />
    </div>
  );
}
