import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function AboutModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Track when component is mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Help Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-1.5 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        aria-label="About Radas Shuttle"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Modal - render as portal at body level */}
      {mounted && isOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-2xl font-bold">🐱 About Radas Shuttle</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <p className="text-base">
                <strong>Radas Shuttle</strong> is a high-performance embeddings client for multiple providers, powered by Rust.
              </p>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Why Radas Shuttle?</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>🎯 Clean, consistent API across all providers</li>
                  <li>🔄 Built-in retry logic with exponential backoff</li>
                  <li>📚 Rich model metadata and capability discovery</li>
                  <li>⚡ High performance - Rust core with Python bindings</li>
                  <li>🔀 First-class support for both sync and async</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Installation</h3>
                <pre className="bg-gray-100 dark:bg-gray-950 p-3 text-xs overflow-x-auto border border-gray-200 dark:border-gray-800">
                  <code>pip install radas-shuttle</code>
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Quick Start</h3>
                <pre className="bg-gray-100 dark:bg-gray-950 p-3 text-xs overflow-x-auto border border-gray-200 dark:border-gray-800">
                  <code>{`from radas_shuttle import Client

# Initialize the client
client = Client()

# Generate embeddings
response = client.embed(
    "openai:text-embedding-3-small",
    ["Hello, embeddings!"]
)

# Access results
print(f"Dimensions: {response.dimensions}")
print(f"Tokens: {response.usage.tokens}")`}</code>
                </pre>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  made with ❤️ by <a href="https://chonkie.ai" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 dark:hover:text-gray-200 underline">chonkie, inc.</a>
                </p>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}
