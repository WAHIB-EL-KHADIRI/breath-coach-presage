/**
 * Privacy statements. They describe what this app does, and say plainly where
 * behaviour belongs to Presage's SDK and has not been independently verified.
 * Keep in sync with docs/PRIVACY.md.
 */
export function PrivacyContent() {
  return (
    <>
      <section className="section">
        <h3>The camera</h3>
        <ul>
          <li>It is opened only after you agree and press Start, and released when you press Stop, press Reset, withdraw consent, close the app, or an error ends the session.</li>
          <li>The camera is the only device used. The microphone is never requested.</li>
          <li>Breath Coach does not record video, take pictures, or save readings. The live signal sits in a small in-memory buffer that is cleared when the session ends.</li>
        </ul>
      </section>
      <section className="section">
        <h3>What leaves your computer</h3>
        <ul>
          <li>Measuring with the camera uses Presage’s SmartSpectra engine and an internet connection. Your API key is checked by Presage’s service.</li>
          <li>Presage documents that its optional telemetry never includes video frames or measured vitals. Breath Coach turns that telemetry off.</li>
          <li>
            <strong>Not independently verified:</strong> exactly what the measurement itself transmits to Presage is described by Presage, not by this app. Breath Coach does not claim that nothing leaves your device.
          </li>
        </ul>
      </section>
      <section className="section">
        <h3>Your API key</h3>
        <ul>
          <li>By default the key is kept in memory for the current run only.</li>
          <li>If you choose “Remember”, it is encrypted with your operating system’s protection (Windows DPAPI) and stored on this device. If the system cannot protect it, nothing is written.</li>
          <li>The key must reach the app window to start the measurement engine; it is never logged and never shown in error messages. You can delete it at any time in Settings.</li>
        </ul>
      </section>
      <section className="section">
        <h3>Simulation</h3>
        <ul>
          <li>The simulation never uses the camera or the network. Everything it shows is synthetic and labelled SIMULATED.</li>
        </ul>
      </section>
      <section className="section">
        <h3>Not a medical device</h3>
        <ul>
          <li>Breath Coach is for relaxation. It does not diagnose, monitor or treat any condition, and its readings are estimates.</li>
        </ul>
      </section>
    </>
  );
}
