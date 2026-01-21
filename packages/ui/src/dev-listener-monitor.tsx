import { useEffect, useState } from "react";
import { subscriptionPool } from "@/shared/hooks/use-subscription-pool";

/**
 * Development-only component to monitor Firestore listener counts
 * Helps identify memory leaks and excessive listener creation
 *
 * Usage: Add this component at the root of your app (only in development)
 */
export function DevListenerMonitor() {
  const [listenerCount, setListenerCount] = useState(0);
  const [subscriptions, setSubscriptions] = useState<
    Array<{ key: string; callbackCount: number }>
  >([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const interval = setInterval(() => {
      const count = subscriptionPool.getListenerCount();
      const details = subscriptionPool.getSubscriptionDetails();
      setListenerCount(count);
      setSubscriptions(details);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Only render in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const hasWarning = listenerCount > 50;
  const hasCritical = listenerCount > 100;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        right: "10px",
        background: hasCritical
          ? "#dc2626"
          : hasWarning
            ? "#f59e0b"
            : "#10b981",
        color: "white",
        padding: "8px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontFamily: "monospace",
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        maxWidth: expanded ? "400px" : "auto",
        cursor: "pointer",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "white",
            animation: "pulse 2s infinite",
          }}
        />
        <div>
          <strong>Firestore Listeners:</strong> {listenerCount}
        </div>
        {hasWarning && <span title="High listener count detected">⚠️</span>}
        {hasCritical && <span title="Critical listener count!">🔥</span>}
      </div>

      {expanded && (
        <div
          style={{
            marginTop: "12px",
            borderTop: "1px solid rgba(255,255,255,0.3)",
            paddingTop: "12px",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "11px", opacity: 0.9 }}>
            Active Subscriptions ({subscriptions.length}):
          </div>
          {subscriptions.length === 0 ? (
            <div style={{ fontSize: "11px", opacity: 0.7 }}>
              No active subscriptions
            </div>
          ) : (
            <div style={{ fontSize: "10px" }}>
              {subscriptions.map((sub, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "4px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ wordBreak: "break-all" }}>{sub.key}</div>
                  <div style={{ opacity: 0.7 }}>
                    Callbacks: {sub.callbackCount}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: "12px",
              fontSize: "11px",
              opacity: 0.8,
              borderTop: "1px solid rgba(255,255,255,0.3)",
              paddingTop: "8px",
            }}
          >
            <div>
              <strong>Thresholds:</strong>
            </div>
            <div>• Normal: &lt; 50 listeners</div>
            <div>• Warning: 50-100 listeners</div>
            <div>• Critical: &gt; 100 listeners</div>
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "10px",
              opacity: 0.7,
            }}
          >
            Click to collapse
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
}

/**
 * Hook to monitor listener count programmatically
 */
export function useListenerMonitor() {
  const [listenerCount, setListenerCount] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const interval = setInterval(() => {
      const count = subscriptionPool.getListenerCount();
      setListenerCount(count);

      // Log warning if count is high
      if (count > 50) {
        console.warn(
          `[Listener Monitor] High listener count: ${count}. This may indicate a memory leak.`
        );
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return { listenerCount };
}
