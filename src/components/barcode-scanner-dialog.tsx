import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { X, Camera, RefreshCw } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  /** if true, keep scanner running after a hit (continuous). Default: false (close on first hit) */
  continuous?: boolean;
};

export function BarcodeScannerDialog({ open, onClose, onDetected, continuous = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const lastHitRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    setError(null);

    (async () => {
      try {
        // Enumerate cameras, prefer back-facing
        const all = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(all);
        const back = all.find((d) => /back|rear|environment/i.test(d.label));
        const chosen = deviceId ?? back?.deviceId ?? all[0]?.deviceId;
        setDeviceId(chosen);

        const constraints: MediaStreamConstraints = chosen
          ? { video: { deviceId: { exact: chosen } } }
          : { video: { facingMode: { ideal: "environment" } } };

        const controls = await reader.decodeFromConstraints(constraints, videoRef.current!, (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          if (code === lastHitRef.current.code && now - lastHitRef.current.ts < 1500) return;
          lastHitRef.current = { code, ts: now };
          try { (navigator as any).vibrate?.(60); } catch { /* ignore */ }
          onDetected(code);
          if (!continuous) {
            controls.stop();
            onClose();
          }
        });
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e?.message ?? "Camera not available. Grant permission and try again.");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  if (!open) return null;

  const switchCamera = () => {
    if (devices.length < 2) return;
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(idx + 1) % devices.length];
    controlsRef.current?.stop();
    setDeviceId(next.deviceId);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" /> Scan barcode
        </div>
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <button onClick={switchCamera} className="size-9 grid place-items-center rounded-md bg-white/10 hover:bg-white/20" title="Switch camera">
              <RefreshCw className="size-4" />
            </button>
          )}
          <button onClick={onClose} className="size-9 grid place-items-center rounded-md bg-white/10 hover:bg-white/20" title="Close">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        {/* Scan reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[80%] max-w-md aspect-[3/2] rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            <div className="w-full h-0.5 bg-primary animate-pulse mt-[50%]" />
          </div>
        </div>
        {error && (
          <div className="absolute inset-x-4 bottom-6 rounded-md bg-destructive/90 text-white text-sm p-3">
            {error}
          </div>
        )}
      </div>
      <div className="text-center text-xs text-white/70 pb-4 pt-2 px-4">
        Point the camera at a product barcode. It will match against the SKU.
      </div>
    </div>
  );
}
