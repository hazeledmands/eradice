import { useState, useEffect } from 'react';
import type { NextPage } from 'next';
import Roller from '../components/Roller/Roller';
import styles from './Home.module.css';

const Home: NextPage = () => {
  const [roomSlug, setRoomSlug] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Parse ?room= from URL client-side (static export has no server-side query)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('room');
    if (slug) setRoomSlug(slug);
    setReady(true);
  }, []);

  const handleRoomCreated = (slug: string) => {
    setRoomSlug(slug);
    window.history.pushState(null, '', `?room=${slug}`);
  };

  const handleRoomLeft = () => {
    setRoomSlug(null);
    window.history.pushState(null, '', window.location.pathname);
  };

  return (
    <div className={styles.App}>
      {ready ? (
        <Roller roomSlug={roomSlug} onRoomCreated={handleRoomCreated} onRoomLeft={handleRoomLeft} />
      ) : (
        <div className={styles.skeleton}>
          <div className={styles.skeletonTerminal}>
            <div className={styles.skeletonLabel} />
            <div className={styles.skeletonInputRow}>
              <div className={styles.skeletonInput} />
              <div className={styles.skeletonButton} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
