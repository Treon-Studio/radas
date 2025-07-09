import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import GlitchText from './ui/glitch-text';

interface InstallationStepProps {
  method: string;
  command: string;
  description: string;
}

const InstallationStep: React.FC<InstallationStepProps> = ({ method, command, description }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="group bg-black/20 backdrop-blur-sm border border-white/10 rounded-lg p-6 hover:bg-black/30 transition-all duration-300">
      <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Geist, sans-serif' }}>
        <GlitchText text={method} triggerOnHover={true} />
      </h3>
      
      <p className="text-gray-300 font-mono text-sm mb-4">
        <GlitchText text={description} triggerOnHover={true} speed={20} />
      </p>
      
      <div className="relative">
        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-3 font-mono text-sm">
          <span className="text-green-400">$</span>
          <code className="text-gray-300 flex-1">
            <GlitchText text={command} triggerOnHover={true} speed={8} />
          </code>
          <button
            onClick={copyToClipboard}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallationStep;