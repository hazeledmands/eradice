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

  if (!ready) return null;

  return (
    <div className={styles.App}>
      <Roller roomSlug={roomSlug} onRoomCreated={handleRoomCreated} />
    </div>
  );
};

export default Home;
