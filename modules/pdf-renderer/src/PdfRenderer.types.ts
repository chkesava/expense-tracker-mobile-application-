export interface RenderedPdfPage {
  uri: string;
  width: number;
  height: number;
  pageIndex: number;
}

export interface RenderPdfResult {
  totalPages: number;
  renderedPages: RenderedPdfPage[];
}
