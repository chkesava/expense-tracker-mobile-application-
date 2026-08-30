export type ProductSplashOverlayProps = {
  onAnimationComplete: () => void;
  /** True when the existing startup critical path has settled. */
  isReady?: boolean;
  /** First painted frame of the JS overlay — used to hide the native splash. */
  onFirstFrame?: () => void;
};
