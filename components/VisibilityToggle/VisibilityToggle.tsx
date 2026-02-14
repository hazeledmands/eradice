import React from 'react';
import type { RollVisibility } from '../../dice/types';
import styles from './VisibilityToggle.module.css';

interface VisibilityToggleProps {
  visibility: RollVisibility;
  onChange: (visibility: RollVisibility) => void;
}

const CYCLE: RollVisibility[] = ['shared', 'secret', 'hidden'];

const LABELS: Record<RollVisibility, string> = {
  shared: 'Shared',
  secret: 'Secret',
  hidden: 'Hidden',
};

export default function VisibilityToggle({ visibility, onChange }: VisibilityToggleProps) {
  const handleClick = () => {
    const nextIndex = (CYCLE.indexOf(visibility) + 1) % CYCLE.length;
    onChange(CYCLE[nextIndex]);
  };

  return (
    <button
      type="button"
      className={styles.toggle}
      data-visibility={visibility}
      onClick={handleClick}
      title={`Roll visibility: ${LABELS[visibility]}`}
    >
      {LABELS[visibility]}
    </button>
  );
}
