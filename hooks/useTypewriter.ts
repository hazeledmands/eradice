import { useState, useEffect, useRef } from 'react';

interface UseTypewriterOptions {
  charDelay?: number;
}

interface UseTypewriterResult {
  displayText: string;
  isTyping: boolean;
}

export function useTypewriter(
  text: string,
  options?: UseTypewriterOptions,
): UseTypewriterResult {
  const charDelay = options?.charDelay ?? 45;
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const prefersReducedMotion = useRef(false);

  // Check reduced motion preference once on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      prefersReducedMotion.current = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
    }
  }, []);

  useEffect(() => {
    // Skip animation for reduced motion
    if (prefersReducedMotion.current) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }

    setDisplayText('');
    setIsTyping(true);

    let index = 0;
    const interval = setInterval(() => {
      index++;
      setDisplayText(text.slice(0, index));
      if (index >= text.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, charDelay);

    return () => clearInterval(interval);
  }, [text, charDelay]);

  return { displayText, isTyping };
}
