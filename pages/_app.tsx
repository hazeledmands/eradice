import type { AppProps } from 'next/app';
import { Rajdhani, Orbitron, Share_Tech_Mono } from 'next/font/google';
import '../instrumentation';
import '../styles/globals.css';
import NaniteBackground from '../components/NaniteBackground/NaniteBackground';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-orbitron',
  display: 'swap',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-share-tech-mono',
  display: 'swap',
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${rajdhani.variable} ${orbitron.variable} ${shareTechMono.variable}`}>
      <NaniteBackground />
      <Component {...pageProps} />
    </div>
  );
}
