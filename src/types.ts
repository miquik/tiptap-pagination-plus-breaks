import { DecorationSet } from "@tiptap/pm/view";

export interface PaginationPlusOptions {
  pageHeight: number;
  pageWidth: number;
  pageGap: number;
  pageBreakBackground: string;
  pageHeaderHeight: number;
  pageFooterHeight: number;
  pageGapBorderSize: number;
  footer?:
    | ((page: number, numPages: number, dom: HTMLElement|undefined) => HTMLElement)
    | string;
  header?:
    | ((page: number, numPages: number, dom: HTMLElement|undefined) => HTMLElement)
    | string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  contentMarginTop: number;
  contentMarginBottom: number;
  //
  showDividerDebug: boolean;
  initializeOnPaste: boolean;
}

export interface PaginationPlusStorageOptions {
  vdivs: VDivInfo[]
  pageContentWidth: number;
  pageContentHeight: number;
  breaksToUpdate: number;
  existingPageCount: number;
  pbs: NodeListOf<HTMLElement>; // HTMLElement[]
}

export type PageInfo = {
  index: number;
  mt: number;
  // children index start
  cis: number;
  // children index end
  cie: number;
};

export type VDivInfo = {
  dir: number; // -1 = before, 1 = after
  height: number;
  lastBottom: number;
  vdivTop?: number;
  decoPos: number
};
