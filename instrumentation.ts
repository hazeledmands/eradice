if (typeof window !== 'undefined') {
  const apiKey = process.env.NEXT_PUBLIC_HONEYCOMB_API_KEY;

  if (apiKey) {
    import('@honeycombio/opentelemetry-web').then(({ HoneycombWebSDK }) =>
      import('@opentelemetry/auto-instrumentations-web').then(
        ({ getWebAutoInstrumentations }) => {
          const sdk = new HoneycombWebSDK({
            apiKey,
            serviceName: 'eradice',
            instrumentations: [getWebAutoInstrumentations()],
          });

          sdk.start();

          // Start perf observers after OTel SDK is initialized
          import('./lib/perfInstrumentation').then(({ initPerfInstrumentation }) => {
            initPerfInstrumentation();
          });
        },
      ),
    );
  }
}
