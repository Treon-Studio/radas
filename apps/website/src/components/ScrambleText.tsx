import * as React from 'react';
import { useScramble } from 'use-scramble';

interface ScrambleTextProps {
  text: string;
}

export function ScrambleText({ text }: ScrambleTextProps) {
  const { ref, replay } = useScramble({
    text: text,
    speed: 0.5,
    tick: 1,
    step: 1,
    scramble: 4,
    seed: 0,
    playOnMount: false,
  });

  return (
    <span ref={ref} onMouseOver={replay} />
  );
}