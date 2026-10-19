import { DecorationSet } from "@tiptap/pm/view";

export interface PaginationPlusOptions {
  pageHeight: number;
  pageWidth: number;
  pageGap: number;
  pageBreakBackground: string;
  pageHeaderHeight: number;
  pageFooterHeight: number;
  pageGapBorderSize: number;
  /*
  footerRight: string;
  footerLeft: string;
  headerRight: string;
  headerLeft: string;
  */
  footer?:
    | ((page: number, numPages: number, dom: HTMLElement|undefined, intersIndex?: number) => HTMLElement)
    | string;
  header?:
    | ((page: number, numPages: number, dom: HTMLElement|undefined, intersInedx?: number) => HTMLElement)
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
  styleElement?: HTMLStyleElement;
  scopeClass?: string;
  ignoreObserver: boolean;
  vdivs: VDivInfo[]
  pageContentWidth: number;
  pageContentHeight: number;
  breaksToUpdate: number;
  existingPageCount: number;
  pbs?: NodeListOf<HTMLElement>; // HTMLElement[]
  lastHeight: number
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
  pageIndex: number
};

