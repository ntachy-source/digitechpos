import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onResult: (text: string) => void;
  onError?: (e: string) => void;
}

export const QrScanner = ({ onResult, onError }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const id = "qr-scanner-region";
    ref.current.id = id;
    const scanner = new Html5Qrcode(id, false);
    scannerRef.current = scanner;

    const config: any = {
      fps: 30,
      qrbox: (vw: number, vh: number) => {
        const size = Math.floor(Math.min(vw, vh) * 0.8);
        return { width: size, height: size };
      },
      aspectRatio: 1.7778,
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      videoConstraints: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        focusMode: "continuous",
        advanced: [{ focusMode: "continuous" }],
      },
    };

    scanner
      .start(
        { facingMode: { ideal: "environment" } } as any,
        config,
        (decoded) => {
          const now = Date.now();
          if (lastRef.current.text === decoded && now - lastRef.current.at < 1000) return;
          lastRef.current = { text: decoded, at: now };
          onResult(decoded);
        },
        () => { /* ignore per-frame errors */ }
      )
      .catch((e) => onError?.(String(e)));

    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="w-full max-w-md mx-auto rounded-lg overflow-hidden bg-black" />;
};
