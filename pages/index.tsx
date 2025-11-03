import type { NextPage } from 'next';
import Roller from '../components/Roller/Roller';
import styles from './Home.module.css';

const Home: NextPage = () => {
  return (
    <div className={styles.App}>
      <Roller />
    </div>
  );
};

export default Home;

