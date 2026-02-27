import type { AppProps } from 'next/app';
import '../styles/globals.css';
import NaniteBackground from '../components/NaniteBackground/NaniteBackground';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <NaniteBackground />
      <Component {...pageProps} />
    </>
  );
}

