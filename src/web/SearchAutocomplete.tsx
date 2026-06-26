import { useState, useEffect, useRef, FormEvent, KeyboardEvent, CSSProperties, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search } from "lucide-react";

interface SearchAutocompleteProps {
  searchEngine: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  value?: string;
  icon?: ReactNode;
}

export function SearchAutocomplete({
  searchEngine,
  onSearch,
  placeholder = "Web'de ara veya URL girin...",
  className = "",
  style,
  autoFocus,
  value,
  icon
}: SearchAutocompleteProps) {
  const [query, setQuery] = useState(value ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<number>();

  useEffect(() => {
    if (value !== undefined) {
      setQuery(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    try {
      const encoded = encodeURIComponent(q);
      const results = await invoke<string[]>("fetch_search_suggestions", { query: encoded, engine: searchEngine });
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch (e) {
      console.error("Öneriler alınamadı:", e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      void fetchSuggestions(val);
    }, 200);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        const selected = suggestions[activeIndex];
        setQuery(selected);
        setIsOpen(false);
        onSearch(selected);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setIsOpen(false);
      onSearch(query.trim());
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", ...style }} className={className}>
      <form onSubmit={handleSubmit} style={{ width: "100%", position: "relative" }}>
        {icon ? (
          <div className="search-autocomplete-icon" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {icon}
          </div>
        ) : (
          <Search className="search-autocomplete-icon" size={16} style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
        )}
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          className="search-autocomplete-input"
        />
      </form>
      {isOpen && suggestions.length > 0 && (
        <ul className="search-autocomplete-dropdown">
          {suggestions.map((item, idx) => (
            <li
              key={item + idx}
              className={`search-autocomplete-item ${idx === activeIndex ? "active" : ""}`}
              onClick={() => {
                setQuery(item);
                setIsOpen(false);
                onSearch(item);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <Search size={14} style={{ marginRight: "12px", opacity: 0.5 }} />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
