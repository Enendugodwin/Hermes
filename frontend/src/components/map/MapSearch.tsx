import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { searchPlaces, type GeoPlace } from "@/lib/mapApi";

/**
 * Gazetteer search for the map workspace. Typing a country, city or `lat,lon`
 * and pressing Enter flies to the best match; alternatives stay selectable.
 */
export function MapSearch({
  onSelect,
  className,
  label = "Search locations",
  placeholder = "Country, city or lat,lon",
}: {
  onSelect: (place: GeoPlace) => void;
  className?: string;
  label?: string;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setResults([]);
    setEmpty(false);
    setOpen(false);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = term.trim();
    if (!value) return;
    setLoading(true);
    try {
      const response = await searchPlaces(value);
      setResults(response.results);
      setEmpty(response.results.length === 0);
      setOpen(true);
      const first = response.results[0];
      if (first) onSelect(first);
    } catch {
      setResults([]);
      setEmpty(true);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function choose(place: GeoPlace) {
    onSelect(place);
    setOpen(false);
  }

  return (
    <form ref={containerRef} onSubmit={runSearch} className={`relative ${className ?? ""}`}>
      <div className="flex h-8 items-center gap-2 rounded-control border border-line/10 bg-panel/80 px-[10px] backdrop-blur-glass">
        <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="w-40 bg-transparent text-2xs font-light text-ink placeholder:text-faint focus:outline-none focus-visible:ring-0 sm:w-48"
        />
        {loading ? (
          <Loader2 className="size-3 animate-spin text-faint" aria-hidden />
        ) : term ? (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label="Clear search"
            className="text-faint hover:text-ink"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 overflow-hidden rounded-card border border-line/[0.1] bg-panel shadow-lift">
          {empty ? (
            <p className="px-3 py-4 text-center text-2xs font-light text-faint">
              No match. Try “Nigeria”, “Lagos” or “8.5, 9.1”.
            </p>
          ) : (
            <ul>
              {results.map((place) => (
                <li key={`${place.kind}-${place.name}`}>
                  <button
                    type="button"
                    onClick={() => choose(place)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-[7px] text-left text-xs font-light text-muted transition-colors duration-150 hover:bg-line/[0.05] hover:text-ink"
                  >
                    <span>{place.name}</span>
                    <span className="font-mono text-3xs uppercase tracking-[0.1em] text-faint">
                      {place.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </form>
  );
}
