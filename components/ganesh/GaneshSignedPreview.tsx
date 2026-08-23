import { memo, useEffect, useState } from "react";
import { Image, StyleSheet } from "react-native";

import { getSignedUrl } from "@/services/ganesh/storage/storageService";

type Props = {
  path: string;
  pandalId: string;
  festivalId?: string;
};

export const GaneshSignedPreview = memo(function GaneshSignedPreview({
  path,
  pandalId,
  festivalId,
}: Props) {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getSignedUrl(path, { pandalId, festivalId })
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [festivalId, pandalId, path]);

  if (!url) return null;
  return <Image source={{ uri: url }} style={styles.thumb} />;
});

const styles = StyleSheet.create({
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderCurve: "continuous",
    marginTop: 8,
  },
});
