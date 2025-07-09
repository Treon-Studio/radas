import React, { useState, useEffect } from 'react';

interface GlitchTextProps {
  text: string;
  className?: string;
  triggerOnHover?: boolean;
  delay?: number;
  speed?: number;
}

const GlitchText: React.FC<GlitchTextProps> = ({ 
  text, 
  className = '', 
  triggerOnHover = false, 
  delay = 0,
  speed = 50
}) => {
  const [displayText, setDisplayText] = useState('');
  const [isGlitching, setIsGlitching] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?`~';
  
  const scrambleText = (originalText: string, progress: number) => {
    return originalText
      .split('')
      .map((char, index) => {
        if (index < progress) {
          return char;
        }
        if (char === ' ') return ' ';
        return chars[Math.floor(Math.random() * chars.length)];
      })
      .join('');
  };

  const runGlitchAnimation = () => {
    if (isGlitching) return;
    
    setIsGlitching(true);
    let progress = 0;
    const totalSteps = text.length;
    
    const interval = setInterval(() => {
      if (progress <= totalSteps) {
        setDisplayText(scrambleText(text, progress));
        progress++;
      } else {
        setDisplayText(text);
        setIsGlitching(false);
        setHasAnimated(true);
        clearInterval(interval);
      }
    }, speed);
  };

  useEffect(() => {
    if (!triggerOnHover) {
      const timer = setTimeout(() => {
        runGlitchAnimation();
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setDisplayText(text);
      setHasAnimated(true);
    }
  }, [text, triggerOnHover, delay]);

  const handleMouseEnter = () => {
    if (triggerOnHover) {
      runGlitchAnimation();
    }
  };

  return (
    <span
      className={`inline-block ${className} ${isGlitching ? 'animate-pulse' : ''}`}
      onMouseEnter={handleMouseEnter}
      style={{
        fontFamily: className.includes('font-mono') ? 'monospace' : 'inherit',
      }}
    >
      {displayText}
    </span>
  );
};

export default GlitchText;