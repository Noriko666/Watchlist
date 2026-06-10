export default function LoginLock({
  busy,
  error,
  pin,
  onPinChange,
  onSubmit
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "enter"];

  const handleKey = (key) => {
    if (busy) return;
    if (key === "clear") {
      onPinChange("");
      return;
    }
    if (key === "enter") {
      onSubmit(pin);
      return;
    }
    if (pin.length < 4) {
      const next = pin + key;
      onPinChange(next);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 0);
      }
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-glow auth-glow-a" aria-hidden="true" />
      <div className="auth-glow auth-glow-b" aria-hidden="true" />
      <div
        className={`auth-card ${busy ? "is-busy" : ""}`}
        key={error || "auth"}
        data-shake={error ? "true" : undefined}
      >
        <svg
          className="auth-torii"
          viewBox="0 0 120 90"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 16 Q60 4 116 16 L116 25 Q60 14 4 25 Z" />
          <rect x="16" y="36" width="88" height="6" rx="1" />
          <rect x="27" y="25" width="9" height="61" rx="1.5" />
          <rect x="84" y="25" width="9" height="61" rx="1.5" />
          <rect x="56" y="25" width="8" height="11" rx="1" />
        </svg>
        <div className="auth-card-head">
          <h1>
            Watchlist
            <span className="auth-card-jp" lang="ja" aria-hidden="true">
              夜のアニメ図書館
            </span>
          </h1>
          <p>Enter your 4-digit PIN</p>
        </div>
        <div className="auth-pin-row" aria-label="PIN entry">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`auth-pin-dot ${pin[i] ? "is-filled" : ""}`}
            />
          ))}
        </div>
        <div className="auth-keypad">
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className={`auth-keypad-key ${key === "clear" || key === "enter" ? "auth-keypad-action" : ""}`}
              onClick={() => handleKey(key)}
              disabled={busy}
            >
              {key === "clear" ? "CLR" : key === "enter" ? "↵" : key}
            </button>
          ))}
        </div>
        {error ? <p className="auth-card-error">{error}</p> : null}
      </div>
    </div>
  );
}
