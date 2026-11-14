"use client";

// The star chip: shows the count baked in at build time, then quietly
// refreshes it from the same-origin stars.json file (the mini PC updates
// that hourly from the GitHub API). A failed or missing file is invisible —
// the baked count simply stays.

import { useEffect, useState } from "react";
import { StarIcon } from "./icons";
import { PRODUCT } from "@/config";

export function StarChip({ baked }: { baked: number | null }) {
  const [count, setCount] = useState<number | null>(baked);

  useEffect(() => {
    let alive = true;
    fetch("stars.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (!alive || text === null) return;
        const n = Number(text.trim());
        if (Number.isFinite(n) && n > 0) setCount(n);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (count === null) return null;

  return (
    <a className="site-head__stars" href={`${PRODUCT.repoUrl}/stargazers`}>
      <StarIcon />
      {count}
    </a>
  );
}
