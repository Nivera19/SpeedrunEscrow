"use client";

const NOTES: Record<string, string> = {
  COMPLIANT: "rules cleared",
  VIOLATION: "rule broken",
  WRONG_CATEGORY: "wrong bracket",
  UNCLEAR: "panel required",
  NONE: "not judged",
  UPHELD: "challenge won",
  DISMISSED: "challenge lost",
  INCONCLUSIVE: "panel required",
};

export function Stamp({
  verdict,
  size = "sm",
}: {
  verdict: string;
  size?: "sm" | "lg";
}) {
  const key = (verdict || "NONE").toLowerCase();
  const label = (verdict || "NONE").replace(/_/g, " ");

  return (
    <span
      className={`stamp stamp-${size} stamp-${key}`}
      title={NOTES[verdict] ?? ""}
    >
      {label}
      {size === "lg" && (
        <span className="stamp-note">{NOTES[verdict] ?? "verdict"}</span>
      )}
    </span>
  );
}
