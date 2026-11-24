import { useEffect, useState } from "react";

export type PositionThumbnailProps = {
  src?: string | null;
  show: boolean;
  onPresenceChange?: (present: boolean) => void;
};

export function PositionThumbnail({
  src,
  show,
  onPresenceChange,
}: PositionThumbnailProps) {
  const [loaded, setLoaded] = useState(true);

  useEffect(() => {
    setLoaded(true);
  }, [src]);

  const present = show && Boolean(src) && loaded;

  useEffect(() => {
    onPresenceChange?.(present);
  }, [present, onPresenceChange]);

  if (!present) {
    return null;
  }

  return (
    <img
      src={src!}
      alt=""
      className="ex-positions-thumb"
      width={56}
      height={56}
      onError={() => {
        setLoaded(false);
      }}
    />
  );
}
