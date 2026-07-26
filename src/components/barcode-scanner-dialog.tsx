import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { X, Camera, RefreshCw, Zap, ZapOff } from "lucide-react";

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
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [status, setStatus] = useState<string>("Starting camera…");
  const lastHitRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Aggressive hints — try harder, all common retail formats
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 800 });
    setError(null);

    (async () => {
      try {
        // Ask for permission first so labels are populated on iOS/Safari
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
          probe.getTracks().forEach((t) => t.stop());
        } catch { /* ignore, will surface later */ }

        const all = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(all);
        const back = all.find((d) => /back|rear|environment|arrière|traseira|trás|hátsó/i.test(d.label))
          ?? all[all.length - 1]; // last camera is usually the main rear on Android
        const chosen = deviceId ?? back?.deviceId ?? all[0]?.deviceId;
        setDeviceId(chosen);

        // High-resolution constraints for sharper decoding
        const videoConstraints: MediaTrackConstraints = chosen
          ? ({
              deviceId: { exact: chosen },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              focusMode: "continuous",
            } as MediaTrackConstraints)
          : ({
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              focusMode: "continuous",
            } as MediaTrackConstraints);

        setStatus("Focusing…");
        const controls = await reader.decodeFromConstraints(
          { video: videoConstraints, audio: false },
          videoRef.current!,
          (result, _err, ctrl) => {
            if (!result) return;
            const code = result.getText();
            if (!code) return;
            const now = Date.now();
            if (code === lastHitRef.current.code && now - lastHitRef.current.ts < 1200) return;
            lastHitRef.current = { code, ts: now };
            try { (navigator as any).vibrate?.(60); } catch { /* ignore */ }
            setStatus(`✓ ${code}`);
            onDetected(code);
            if (!continuous) {
              ctrl.stop();
              onClose();
            }
          },
        );
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;

        // Capture stream for torch + focus tuning
        const stream = (videoRef.current?.srcObject as MediaStream) || null;
        streamRef.current = stream;
        const track = stream?.getVideoTracks?.()[0];
        if (track) {
          const caps: any = track.getCapabilities?.() ?? {};
          setTorchSupported(!!caps.torch);
          // Try to enable continuous focus / exposure explicitly
          const advanced: any[] = [];
          if (caps.focusMode?.includes?.("continuous")) advanced.push({ focusMode: "continuous" });
          if (caps.exposureMode?.includes?.("continuous")) advanced.push({ exposureMode: "continuous" });
          if (caps.whiteBalanceMode?.includes?.("continuous")) advanced.push({ whiteBalanceMode: "continuous" });
          if (advanced.length) {
            try { await track.applyConstraints({ advanced } as any); } catch { /* ignore */ }
          }
        }
        setStatus("Point at barcode");
      } catch (e: any) {
        setError(e?.message ?? "Camera not available. Grant permission and try again.");
      }
    })();

    return () => {
      cancelled = true;
      try {
        const track = streamRef.current?.getVideoTracks?.()[0];
        if (track && torchOn) track.applyConstraints({ advanced: [{ torch: false } as any] } as any).catch(() => {});
      } catch { /* ignore */ }
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  if (!open) return null;

  const switchCamera = () => {
    if (devices.length < 2) return;
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(idx + 1) % devices.length];
    controlsRef.current?.stop();
    setTorchOn(false);
    setDeviceId(next.deviceId);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] } as any);
      setTorchOn((v) => !v);
    } catch { /* ignore */ }
  };

  const tapToFocus = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      // Quick refocus pulse: switch to manual then back to continuous
      await track.applyConstraints({ advanced: [{ focusMode: "manual" } as any] } as any).catch(() => {});
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] } as any).catch(() => {});
      setStatus("Refocused");
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="size-4" /> Scan barcode
        </div>
        <div className="flex items-center gap-2">
          {torchSupported && (
            <button onClick={toggleTorch} className="size-9 grid place-items-center rounded-md bg-white/10 hover:bg-white/20" title="Toggle flash">
              {torchOn ? <ZapOff className="size-4" /> : <Zap className="size-4" />}
            </button>
          )}
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
      <div className="relative flex-1 overflow-hidden" onClick={tapToFocus}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
        {/* Scan reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[85%] max-w-md aspect-[3/2] rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative overflow-hidden">
            <div className="absolute left-0 right-0 h-0.5 bg-primary/90 animate-[scanline_1.6s_ease-in-out_infinite]" style={{ top: 0 }} />
          </div>
        </div>
        <style>{`@keyframes scanline { 0%{top:5%} 50%{top:95%} 100%{top:5%} }`}</style>
        {error && (
          <div className="absolute inset-x-4 bottom-6 rounded-md bg-destructive/90 text-white text-sm p-3">
            {error}
          </div>
        )}
      </div>
      <div className="text-center text-xs text-white/80 pb-4 pt-2 px-4 space-y-1">
        <div className="font-medium">{status}</div>
        <div className="text-white/60">Hold 10–20 cm away · tap screen to refocus · use flash in low light</div>
      </div>
    </div>
  );
}
