/** A row of key caps, e.g. `<Kbd keys={["⌘", "⇧", "Space"]} />`. */
export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="kbd">
      {keys.map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  );
}
