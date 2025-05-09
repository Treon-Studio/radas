import { useEffect } from "@lynx-js/react";
import Header from "./components/Header.jsx"; // Corrected extension and component name casing
import "./App.css";

export function App() {
  useEffect(() => {
    console.info("Hello, ReactLynx");
  }, []);

  return (
    <page>
      <view className="App">
        <view className="Background" />
        <Header />
        <view style={{ marginTop: "80px", padding: "16px" }}>
          <view className="Welcome">
            <text className="Title">Welcome 👋</text>
          </view>

          <view className="Section">
            <text className="Subtitle">Step 1: Try It</text>
            <text>
              Edit App.tsx to see changes. Shake or Press{" "}
              <text className="Highlight">cmd + m</text> to open
              developer tools.
            </text>
          </view>

          <view className="Section">
            <text className="Subtitle">Step 2: Debug</text>
            <text>
              Double tap <text className="Highlight">R</text> on your keyboard to
              reload your app's code.
            </text>
          </view>
        </view>
      </view>
    </page>
  );
}