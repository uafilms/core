import React from 'react';
import './turnstile.css';
import { useTurnstile } from './useTurnstile';
import TurnstileCard from './TurnstileCard';

export default function TurnstileWidget() {
  const { config, state, animPhase, handleAnimEnd, handleClick } = useTurnstile();

  if (!config || !config.enabled) return null;

  return (
    <TurnstileCard
      state={state}
      animPhase={animPhase}
      onAnimEnd={handleAnimEnd}
      onClick={handleClick}
    />
  );
}
