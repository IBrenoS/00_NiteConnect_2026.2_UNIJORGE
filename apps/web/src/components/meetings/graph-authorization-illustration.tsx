import styles from "./graph-authorization.module.css";

export function GraphAuthorizationIllustration() {
  return (
    <svg className={styles.illustration} viewBox="0 0 1000 300" role="img" aria-labelledby="graph-illustration-title graph-illustration-description">
      <title id="graph-illustration-title">Conexão interrompida entre uma câmera de reunião e o Microsoft 365</title>
      <desc id="graph-illustration-description">Uma câmera tenta se conectar ao globo do Microsoft 365, mas a conexão é interrompida por um X vermelho.</desc>
      <defs>
        <linearGradient id="camera-surface" x1="120" y1="88" x2="220" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#173d78" />
          <stop offset="1" stopColor="#10233e" />
        </linearGradient>
        <linearGradient id="camera-stroke" x1="94" y1="98" x2="225" y2="223" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3286ff" />
          <stop offset="1" stopColor="#57b9ff" />
        </linearGradient>
        <linearGradient id="connector" x1="252" y1="150" x2="421" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor="#448fff" />
          <stop offset="1" stopColor="#5ba5ff" />
        </linearGradient>
        <linearGradient id="globe" x1="758" y1="82" x2="910" y2="230" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c3e6ff" />
          <stop offset="1" stopColor="#568bd4" />
        </linearGradient>
        <radialGradient id="camera-halo">
          <stop stopColor="#237aff" stopOpacity=".22" />
          <stop offset="1" stopColor="#237aff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="globe-halo">
          <stop stopColor="#247dff" stopOpacity=".17" />
          <stop offset="1" stopColor="#247dff" stopOpacity="0" />
        </radialGradient>
        <filter id="x-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx="153" cy="150" r="142" fill="url(#camera-halo)" />
      <circle cx="153" cy="150" r="128" fill="none" stroke="#257eff" strokeOpacity=".12" strokeWidth="2" />
      <circle cx="153" cy="150" r="95" fill="#0d1d33" fillOpacity=".38" stroke="#2d78e2" strokeOpacity=".12" />
      <rect x="82" y="90" width="142" height="120" rx="25" fill="url(#camera-surface)" stroke="url(#camera-stroke)" strokeWidth="2.5" />
      <rect x="104" y="122" width="68" height="48" rx="8" fill="#8ccaff" fillOpacity=".18" stroke="#a7d6ff" strokeWidth="4" />
      <path d="m172 136 25-17c4-3 9 0 9 5v40c0 5-5 8-9 5l-25-17v-16Z" fill="#77baff" fillOpacity=".3" stroke="#a7d6ff" strokeLinejoin="round" strokeWidth="4" />

      <path d="M224 150h123" stroke="url(#connector)" strokeLinecap="round" strokeWidth="4" />
      <g fill="#75aaff">
        <circle cx="365" cy="150" r="2.7" /><circle cx="378" cy="150" r="2.7" /><circle cx="391" cy="150" r="2.7" />
      </g>
      <circle cx="404" cy="150" r="2.8" fill="#af8fd7" />
      <circle cx="417" cy="150" r="2.8" fill="#db6570" />
      <circle cx="430" cy="150" r="2.8" fill="#ef5360" />

      <path d="M449 127a57 57 0 0 1 102 0" fill="none" stroke="#ff515c" strokeOpacity=".35" strokeWidth="4" />
      <path d="M449 173a57 57 0 0 0 102 0" fill="none" stroke="#ff515c" strokeOpacity=".28" strokeWidth="4" />
      <circle cx="500" cy="150" r="53" fill="#ed3443" fillOpacity=".055" />
      <path d="m480 130 40 40m0-40-40 40" fill="none" stroke="#ff5b65" strokeLinecap="round" strokeWidth="8" filter="url(#x-glow)" />

      <circle cx="570" cy="150" r="2.8" fill="#ef5360" />
      <circle cx="583" cy="150" r="2.8" fill="#db6570" />
      <circle cx="596" cy="150" r="2.8" fill="#af8fd7" />
      <g fill="#75aaff"><circle cx="609" cy="150" r="2.7" /><circle cx="622" cy="150" r="2.7" /><circle cx="635" cy="150" r="2.7" /></g>
      <path d="M653 150h111" stroke="url(#connector)" strokeLinecap="round" strokeWidth="4" />

      <circle cx="845" cy="150" r="142" fill="url(#globe-halo)" />
      <circle cx="845" cy="150" r="128" fill="none" stroke="#257eff" strokeOpacity=".11" strokeWidth="2" />
      <circle cx="845" cy="150" r="95" fill="#0d1d33" fillOpacity=".34" stroke="#2d78e2" strokeOpacity=".12" />
      <g fill="none" stroke="url(#globe)" strokeWidth="4" opacity=".94">
        <circle cx="845" cy="150" r="69" />
        <path d="M776 150h138M845 81v138" />
        <ellipse cx="845" cy="150" rx="31" ry="69" />
        <path d="M791 112c31 20 77 20 108 0M791 188c31-20 77-20 108 0" />
      </g>
      <g transform="translate(875 166)">
        <path d="M0 0h23v23H0z" fill="#f35325" stroke="#0b1320" strokeWidth="2" />
        <path d="M26 0h23v23H26z" fill="#81bc06" stroke="#0b1320" strokeWidth="2" />
        <path d="M0 26h23v23H0z" fill="#05a6f0" stroke="#0b1320" strokeWidth="2" />
        <path d="M26 26h23v23H26z" fill="#ffba08" stroke="#0b1320" strokeWidth="2" />
      </g>
    </svg>
  );
}
