import { useTheme } from "../theme";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// The full light/dark/system choice — lives on the settings page. The
// topbar's ThemeToggle is just a quick light<->dark flip for convenience.
export default function ThemePreference() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="tabs">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`tab ${preference === o.value ? "active" : ""}`}
          onClick={() => setPreference(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
