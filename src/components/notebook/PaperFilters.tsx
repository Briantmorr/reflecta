export function PaperFilters() {
  return (
    <defs>
      <filter id="pg-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="17" />
        <feColorMatrix values="0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0 0.04  0 0 0 0.05 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id="pg-fox" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="5" />
        <feColorMatrix values="0 0 0 0 0.50  0 0 0 0 0.36  0 0 0 0 0.20  0 0 0 0.22 0" />
        <feComposite in2="SourceGraphic" operator="in" />
      </filter>
      <filter id="pg-wobble" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" />
        <feDisplacementMap in="SourceGraphic" scale="1.6" />
      </filter>
    </defs>
  )
}
