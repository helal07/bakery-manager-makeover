import { Phone } from "lucide-react";

const WHATSAPP_URL = "https://api.whatsapp.com/send/?phone=1682000977";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.347-.347.52-.52.174-.174.232-.298.347-.497.116-.198.058-.372-.03-.52-.086-.15-.66-1.59-.905-2.178-.238-.571-.48-.487-.66-.496l-.564-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.174-1.414-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.19-.31a8.16 8.16 0 0 1-1.25-4.35c0-4.54 3.7-8.23 8.24-8.23a8.23 8.23 0 0 1 8.22 8.24c0 4.54-3.69 8.23-8.25 8.23z" />
    </svg>
  );
}

export function DevFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground ${className}`}
    >
      <span>
        Developed by{" "}
        <a
          href="https://www.itsolution.bd"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground hover:underline"
        >
          IT Solution
        </a>
      </span>
      <span className="hidden sm:inline opacity-40">|</span>
      <a href="tel:+8801682000977" className="inline-flex items-center gap-1.5 hover:underline">
        <Phone className="size-3.5" /> +8801682000977
      </a>
      <span className="hidden sm:inline opacity-40">|</span>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 hover:underline"
      >
        <WhatsAppIcon className="size-4 text-[#25D366]" /> WhatsApp
      </a>
    </div>
  );
}

export default DevFooter;
