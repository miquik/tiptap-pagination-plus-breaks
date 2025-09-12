import { DecorationSet } from "@tiptap/pm/view";

export interface PaginationPlusOptions {
  pageHeight: number;
  pageGap: number;
  pageBreakBackground: string;
  pageHeaderHeight: number;
  pageFooterHeight: number;
  pageGapBorderSize: number;
  footerRight: string;
  footerLeft: string;
  headerRight: string;
  headerLeft: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  contentMarginTop: number;
  contentMarginBottom: number;
  showDividerDebug: boolean
}


export interface PaginationPlusStorageOptions {
  ignoreObserver: boolean
  vdivs: Map<string, VDivInfo>
  pageContentWidth: number
  pageContentHeight: number
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
  type: number; // 0 = PAGEBREAK, 1 = FIGURE
  dir: number; // -1 = before, 1 = after
  height: number;
  lastBottom: number;
};

