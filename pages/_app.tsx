import type { AppProps } from 'next/app';
import '../styles/globals.css';
import NaniteDust from '../components/NaniteDust/NaniteDust';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <NaniteDust />
      <Component {...pageProps} />
    </>
  );
}

