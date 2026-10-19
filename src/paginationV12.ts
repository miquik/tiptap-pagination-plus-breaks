import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Editor, Extension } from '@tiptap/core'
import {
	PageInfo,
	PaginationPlusOptions,
	PaginationPlusStorageOptions,
	VDivInfo,
} from './paginationV12Types'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { EditorState } from '@tiptap/pm/state'
import { MeasureManager } from './measureManager'
import { findAllFloatIntersections, PrefixSumIndex, PrefixSumIntersectResult } from './prefixSumIndex'

// NOTE: questa versione mi piace di più però ha un problema, cioè il contenuto non "shifta"
// veramente quando inserisco un vdiv (perchè fondamentalmente è solo un "adorner" sopra il contenuto)
// quindi per esempio se ho un border attorno ad un paragrafo ottengo una visualizzazione non corretta
// I VDIV DEVONO ESSERE ELEMENTI "FISICI" DENTRO IL CONTENUTO

declare module '@tiptap/core' {
	interface Storage {
		PaginationV12: PaginationPlusStorageOptions
	}
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		PaginationV12: {
			resetPagination: () => ReturnType
		}
	}
}

const MIN_H_GUARD = 4
const START_PAGE_NUM = 5

const META_RESET = 'pb:reset'
const META_RESUME = 'pb:resume'
const META_PAGEDECOS = 'pb:page-decos'
const META_VDIVS = 'pb:page-vdivs'

type MyState = {
	lastPageCount: number
	decos: DecorationSet
	interDecos: DecorationSet
	vdivsVersion: number
	vdivIndex: number
	vdivs: VDivInfo[]
	first?: boolean
}

export const myPluginKey = new PluginKey<MyState>('paginationV12-plugin')

export const PaginationV12 = Extension.create<
	PaginationPlusOptions,
	PaginationPlusStorageOptions
>({
	name: 'PaginationV12',
	addOptions() {
		return {
			pageHeight: 800,
			pageWidth: 600,
			pageGap: 50,
			pageGapBorderSize: 1,
			pageBreakBackground: '#ffffff',
			pageHeaderHeight: 30,
			pageFooterHeight: 30,
			footer: '{page}',
			header: '',
			marginTop: 20,
			marginBottom: 20,
			marginLeft: 50,
			marginRight: 50,
			contentMarginTop: 10,
			contentMarginBottom: 10,
			showDividerDebug: false,
			initializeOnPaste: true,
		}
	},
	addStorage() {
		return {
			ignoreObserver: false, vdivs: [], pageContentWidth: this.options.pageWidth - this.options.marginLeft - this.options.marginRight,
			pageContentHeight: this.options.pageHeight - this.options.pageHeaderHeight - this.options.pageFooterHeight - this.options.marginTop - this.options.marginBottom - this.options.contentMarginTop - this.options.contentMarginBottom,
			breaksToUpdate: 0, existingPageCount: 0, lastHeight: 0,
		} as PaginationPlusStorageOptions
	},
	onCreate() {
		const targetNode = this.editor.view.dom
		targetNode.classList.add('rm-with-pagination')
		targetNode.style.width =
			this.options.pageWidth -
			this.options.marginLeft -
			this.options.marginRight +
			'px'
		targetNode.style.marginLeft = this.options.marginLeft + 'px'
		targetNode.style.marginRight = this.options.marginRight + 'px'
		// const config = { attributes: true };
		const headerFooterHeight =
			this.options.pageHeaderHeight + this.options.pageFooterHeight
		const _pageContentHeight =
			this.options.pageHeight -
			headerFooterHeight -
			this.options.contentMarginTop -
			this.options.contentMarginBottom -
			this.options.marginTop -
			this.options.marginBottom

		const style = document.createElement('style')
		style.dataset.rmPaginationStyle = ''

		const scope = `rm-pagination-${Math.random().toString(36).slice(2)}`
		targetNode.classList.add(scope)
		this.storage.scopeClass = scope
		style.textContent = `
      .rm-with-pagination {
        counter-reset: page-number;
      }
      .rm-with-pagination .image-plus-wrapper,
      .rm-with-pagination .table-plus td,
      .rm-with-pagination .table-plus th {
        max-height: ${_pageContentHeight - 10}px;
        overflow-y: auto;
      }
      .rm-with-pagination .image-plus-wrapper {
        overflow-y: visible;
      }
      .rm-with-pagination .rm-page-footer {
        counter-increment: page-number;
        margin-bottom: ${this.options.marginBottom}px;
      }
      .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap {
        display: none;
      }
      .rm-with-pagination .rm-page-break:last-child .rm-page-header {
        display: none;
      }
      
      .rm-with-pagination table tr td,
      .rm-with-pagination table tr th {
        word-break: break-all;
      }
      .rm-with-pagination table > tr {
        display: grid;
        min-width: 100%;
      }
      .rm-with-pagination table {
        border-collapse: collapse;
        width: 100%;
        display: contents;
      }
      .rm-with-pagination table tbody{
        display: table;
        max-height: 300px;
        overflow-y: auto;
      }
      .rm-with-pagination table tbody > tr{
        display: table-row !important;
      }
      .rm-with-pagination p:has(br.ProseMirror-trailingBreak:only-child) {
        display: table;
        width: 100%;
      }
      .rm-with-pagination .table-row-group {
        max-height: ${_pageContentHeight}px;
        overflow-y: auto;
        width: 100%;
      }
      .rm-with-pagination .rm-page-footer-left,
      .rm-with-pagination .rm-page-footer-right,
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-header-right {
        display: inline-block;
      }
      
      .rm-with-pagination .rm-page-header-left,
      .rm-with-pagination .rm-page-footer-left{
        float: left;
        margin-left: ${this.options.marginLeft}px;
      }
      .rm-with-pagination .rm-page-header-right,
      .rm-with-pagination .rm-page-footer-right{
        float: right;
        margin-right: ${this.options.marginRight}px;
      }
      .rm-with-pagination .rm-page-number::before {
        content: counter(page-number);
      }
      .rm-with-pagination .rm-first-page-header{        
        width: 100%;
      }
      .rm-with-pagination .rm-page-header,
      .rm-with-pagination .rm-first-page-header{
        margin-bottom: ${this.options.contentMarginTop}px !important;
        margin-top: ${this.options.marginTop}px !important;
      }
      .rm-with-pagination .rm-page-footer{
        margin-top: ${this.options.contentMarginBottom}px !important;
        margin-bottom: ${this.options.marginBottom}px !important;
      }
    `.replace(/\.rm-with-pagination/g, `.${scope}`)
		this.storage.styleElement = style
		document.head.appendChild(style)
	},
	onDestroy() {
		this.storage.styleElement?.remove()
		if (this.storage.scopeClass) this.editor.view.dom.classList.remove(this.storage.scopeClass)
	},
	onUpdate() {
		const targetNode = this.editor.view.dom
		const headerFooterHeight =
			this.options.pageHeaderHeight + this.options.pageFooterHeight
		const _pageContentHeight =
			this.options.pageHeight -
			headerFooterHeight -
			this.options.contentMarginTop -
			this.options.contentMarginBottom -
			this.options.marginTop -
			this.options.marginBottom
		this.editor.storage.PaginationV12.pageContentHeight = _pageContentHeight
		this.editor.storage.PaginationV12.pageContentWidth = this.options.pageWidth - this.options.marginLeft - this.options.marginRight
	},
	addCommands() {
		return {
			resetPagination:
				() =>
				({ state, dispatch }) => {
					if (!dispatch) return true
					dispatch(
						state.tr.setMeta(META_RESET, {
							reset: true,
						})
					)
					return true
				},
		}
	},
	addProseMirrorPlugins() {
		const pageOptions = this.options
		const editor = this.editor

		return [
			new Plugin<MyState>({
				key: myPluginKey,

				state: {
					init(_, state) {
						return initializePagination(editor, state, pageOptions)
					},

					apply(tr, prev, state, newState) {
						// importante: mappare SEMPRE
						const decos = prev.decos.map(tr.mapping, tr.doc)
						const interDecos = prev.interDecos.map(tr.mapping, tr.doc)

						if (tr.getMeta(META_PAGEDECOS)) {
							const meta = tr.getMeta(META_PAGEDECOS)
							const pageCount = meta ? meta.pageCount : prev.lastPageCount

							// ricalcoliamo le pagine
							const deco = createDecoration(
								editor,
								state,
								pageOptions,
								pageCount,
								meta.inters
							)
							// ricalcoliamo intersezioni
							const intersDeco = createIntersDecoration(
								editor,
								state,
								meta.inters
							)

							return {
								decos: DecorationSet.create(state.doc, [...deco]),
								interDecos: DecorationSet.create(state.doc, [
									...intersDeco,
								]),
								lastPageCount: pageCount,
								vdivsVersion: prev.vdivsVersion + 1,
								vdivIndex: meta.vdivRecalcIndex,
								vdivs: prev.vdivs,
							}
						}

						if (tr.getMeta(META_VDIVS)) {
							const meta = tr.getMeta(META_VDIVS)

							// ricalcoliamo intersezioni
							// CHECK: serve?
							const intersDeco = createIntersDecoration(
								editor,
								state,
								meta.inters
							)

							return {
								decos: prev.decos,
								interDecos: DecorationSet.create(state.doc, [
									...intersDeco,
								]),
								lastPageCount: prev.lastPageCount ?? 1,
								vdivsVersion: prev.vdivsVersion + 1,
								vdivIndex: meta.vdivRecalcIndex,
								vdivs: prev.vdivs,
							}
						}

						if (tr.getMeta(META_RESET)) {
							// resettiamo
							return initializePagination(editor, state, pageOptions)
						}

						return {
							decos,
							interDecos,
							lastPageCount: prev.lastPageCount,
							vdivsVersion: prev.vdivsVersion,
							vdivIndex: 0,
							vdivs: prev.vdivs,
						}
					},
				},

				props: {
					decorations(state) {
						const s = this.getState(state)
						if (!s) return DecorationSet.empty
						// Creiamo sempre un elemento in fondo con
						// per non sbagliare le misure
						const at = state.doc.content.size

						const endDeco = Decoration.widget(at, view => {
							const fillHeight = 1
							const div = document.createElement('div')
							div.className = 'rm-end-document'
							div.style.height = fillHeight + 'px'
							if (pageOptions.showDividerDebug)
								div.style.backgroundColor = 'yellow'
							return div
						})

						const all = [...s.decos.find(), ...s.interDecos.find(), endDeco]
						return DecorationSet.create(state.doc, all)
					},
					handlePaste(view: EditorView, _event, _slice) {
						if (!pageOptions.initializeOnPaste) {
							return false // non fare nulla di speciale
						}
						// Innesca reset, poi lascia che TipTap gestisca l'incolla normalmente
						const tr = view.state.tr.setMeta(META_RESET, {
							reset: true,
						})
						view.dispatch(tr)
						return false // false = non consumare, continua il paste standard
					},
				},

				view(editorView) {
					return new MyPluginView(editorView, pageOptions)
				},
			}),
		]
	},
})

class MyPluginView {
	view: EditorView
	container: HTMLElement | null = null
	destroyed: boolean = false
	measureManager: MeasureManager | null = null
	readonly prefixSumIndex: PrefixSumIndex
	readonly pageOptions: PaginationPlusOptions

	constructor(view: EditorView, pageOptions: PaginationPlusOptions) {
		this.view = view
		this.pageOptions = pageOptions
		this.measureManager = new MeasureManager({
			waitForFonts: true,
			doubleRaf: true,
		})
		this.prefixSumIndex = new PrefixSumIndex()
		this.updateContainerRef()
		this.update(view, view.state)
	}

	update(view: EditorView, prevState: any) {
		this.view = view

		// se ProseMirror ha ricreato il DOM → riprendi ref
		if (!this.container || !this.container.isConnected) {
			this.updateContainerRef()
		}

		// misura
		const prev = myPluginKey.getState(prevState)
		const curr = myPluginKey.getState(view.state)

		if (curr?.first) {
			this.measureManager!.schedule({
				key: 'key',
				root: view.dom,
				onReady: () => {
					if (this.destroyed) return

					const current = myPluginKey.getState(this.view.state)
					if (!current) return
					layoutPages(
						this.view,
						current.vdivs,
						this.prefixSumIndex,
						this.pageOptions,
						current.lastPageCount
					)
					const updated = myPluginKey.getState(this.view.state)
					if (updated) this.render(updated.vdivIndex, updated.vdivs)
					refreshPage(this.view.dom)
				},
			})
			return
		}

		if (!prevState.doc.eq(view.state.doc)) {
			layoutPages(
				view,
				curr?.vdivs ?? [],
				this.prefixSumIndex,
				this.pageOptions,
				curr?.lastPageCount ?? 0
			)
		}

		if (!curr) return
		if (!prev || curr.vdivsVersion > prev.vdivsVersion) {
			this.render(curr.vdivIndex, curr.vdivs)
		}

		refreshPage(this.view.dom)
	}

	updateContainerRef() {
		// trovi il tuo widget nel DOM
		this.container = this.view.dom.querySelector('#pages')
	}

	render(vdivIndex: number, vdivs: VDivInfo[]) {
		if (!this.container) return
		if (!this.pageOptions) return

		const _pageGap = this.pageOptions.pageGap
		const _pageHeaderHeight =
			this.pageOptions.pageHeaderHeight +
			this.pageOptions.contentMarginTop +
			this.pageOptions.marginTop
		const _pageFooterHeight =
			this.pageOptions.pageFooterHeight +
			this.pageOptions.contentMarginBottom +
			this.pageOptions.marginBottom
		const _pageHeight =
			this.pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight

		// for (const vdiv of this.storage?.vdivs ?? []) {
		if (vdivs && vdivs.length > 0) {
			for (let i = vdivIndex; i < vdivs.length; i++) {
				const vdiv = vdivs[i]
				if (vdiv.pageIndex < 0) continue

				if (this.container.children.length <= vdiv.pageIndex) {
					// throw new Error('Non dovrebbe succedere')
					continue;
				}

				const pagChildren = this.container.children[vdiv.pageIndex]
				const pagChildrenPage = pagChildren.firstElementChild as HTMLElement
				const defaultMarginTop =
					vdiv.pageIndex === 0 ? _pageHeight + _pageHeaderHeight : _pageHeight
				pagChildrenPage.style.marginTop = `${defaultMarginTop - vdiv.height}px`
				if (pagChildren.children[1].className === 'vdiv-spacer') {
					const tDiv = pagChildren.children[1] as HTMLElement
					tDiv.style.height = `${vdiv.height}px`
				} else {
					const tempDiv = document.createElement('div')
					tempDiv.className = 'vdiv-spacer'
					tempDiv.style.width = '100%'
					tempDiv.style.height = `${vdiv.height}px`
					// tempDiv.style.backgroundColor = 'yellow'
					tempDiv.style.position = 'relative'
					tempDiv.style.float = 'left'
					tempDiv.style.clear = 'both'
					pagChildren.insertBefore(tempDiv, pagChildren.lastElementChild)
				}
			}
		}
	}

	destroy() {
		this.destroyed = true
		this.container = null
		this.measureManager?.destroy()
	}
}

const initializePagination = (
	editor: Editor,
	state: EditorState,
	pageOptions: PaginationPlusOptions
) => {
	const deco = createDecoration(editor, state, pageOptions, START_PAGE_NUM, [])

	return {
		decos: DecorationSet.create(state.doc, [...deco]),
		interDecos: DecorationSet.empty,
		lastPageCount: 0,
		vdivsVersion: 0,
		vdivIndex: 0,
		vdivs: [],
		first: true,
	}
}

// return: false se vdivs NON devono essere ricalcolati, oppure l'index iniziale
// del primo elemento da modificare [index ... vdivs.length-1]
const vdivsMustBeRecalculated = (
	pbs: NodeListOf<Element>,
	vdivs: VDivInfo[]
): number | false => {
	if (pbs.length === 0) {
		return vdivs.length > 0 ? 0 : false
	}

	// il numero di pbs è cambiato
	// ricalcoliamo dall'inizio
	if (pbs.length != vdivs.length) {
		if (vdivs.length > pbs.length) vdivs.length = pbs.length
		return 0
	}
	// offsetTop di qualche pbs è cambiato
	let index = 0
	for (const pb of pbs) {
		const pbElement = pb as HTMLElement
		const br = vdivs[index]
		if (
			!br ||
			Math.abs(pbElement.offsetTop + pbElement.offsetHeight - br.lastBottom) >
				MIN_H_GUARD
		) {
			return index
		}
		index++
	}

	// la struttura dei pbs non è più corretta (vdiv-spacer deve essere il vicino superiore o inferiore del pb)
	/*
  for (const pb of pbs) {
    if (
      pb.nextElementSibling?.classList.contains("vdiv-spacer") === false &&
      pb.previousElementSibling?.classList.contains("vdiv-spacer") === false
    ) {
      return true;
    }
  }
  */
	return false
}

const getExistingPageCount = (view: EditorView) => {
	const editorDom = view.dom
	const paginationElement = editorDom.querySelector('[data-rm-pagination]')
	if (paginationElement) {
		return paginationElement.children.length
	}
	return 0
}

const calculatePageCount = (view: EditorView, pageOptions: PaginationPlusOptions) => {
	const editorDom = view.dom
	const _pageHeaderHeight =
		pageOptions.pageHeaderHeight +
		pageOptions.contentMarginTop +
		pageOptions.marginTop
	const _pageFooterHeight =
		pageOptions.pageFooterHeight +
		pageOptions.contentMarginBottom +
		pageOptions.marginBottom
	const pageContentAreaHeight =
		pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight
	const paginationElement = editorDom.querySelector('[data-rm-pagination]')
	const currentPageCount = getExistingPageCount(view)
	if (paginationElement) {
		const lastElementOfEditor = editorDom.lastElementChild as HTMLElement
		const lastPageBreak = paginationElement.lastElementChild?.querySelector(
			'.breaker'
		) as HTMLElement
		if (lastElementOfEditor) {
			const lastElementOfEditorBottom =
				lastElementOfEditor.offsetTop + lastElementOfEditor.offsetHeight

			const pageCount = Math.ceil(
				(lastElementOfEditorBottom - _pageHeaderHeight) /
					(pageOptions.pageHeight + pageOptions.pageGap)
			)
			return pageCount <= 0 ? 1 : pageCount
		}
		return 1
	} else {
		const editorHeight = editorDom.scrollHeight
		const pageCount = Math.ceil(editorHeight / pageContentAreaHeight)
		return pageCount <= 0 ? 1 : pageCount
	}
}

function createDecoration(
	editor: Editor,
	state: EditorState,
	pageOptions: PaginationPlusOptions,
	pageCount: number,
	inters: PrefixSumIntersectResult[],
	isInitial: boolean = false
): Decoration[] {
	const pageWidget = Decoration.widget(
		0,
		view => {
			const _pageGap = pageOptions.pageGap
			const _pageHeaderHeight =
				pageOptions.pageHeaderHeight +
				pageOptions.contentMarginTop +
				pageOptions.marginTop
			const _pageFooterHeight =
				pageOptions.pageFooterHeight +
				pageOptions.contentMarginBottom +
				pageOptions.marginBottom
			const _pageHeight =
				pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight
			const _pageBreakBackground = pageOptions.pageBreakBackground

			const el = document.createElement('div')
			el.dataset.rmPagination = 'true'

			const fragment = document.createDocumentFragment()

			let j = 0
			let currentNodeIndex = inters.length > 0 ? inters[0].nodeIndex : 0
			for (let i = 0; i < pageCount; i++) {
				// se matchiamo il floatIndex → aggiorniamo
				if (j < inters.length && i === inters[j].floatIndex) {
					currentNodeIndex = inters[j].nodeIndex
					j++
				}
				if (i === 0) {
					fragment.appendChild(
						pageBreakDefinition({
							firstPage: true,
							pageOptions,
							_pageHeaderHeight,
							_pageHeight,
							_pageGap,
							_pageBreakBackground,
							placeholder: false,
							pageIndex: i + 1,
							numPages: pageCount,
							dom: view.dom,
							imIndex: currentNodeIndex,
						})
					)
				} else {
					fragment.appendChild(
						pageBreakDefinition({
							firstPage: false,
							pageOptions,
							_pageHeaderHeight,
							_pageHeight,
							_pageGap,
							_pageBreakBackground,
							placeholder: false,
							pageIndex: i + 1,
							numPages: pageCount,
							dom: view.dom,
							imIndex: currentNodeIndex,
						})
					)
				}
			}
			el.append(fragment)
			el.id = 'pages'

			return el
		},
		{ side: -1 }
	)
	const firstHeaderWidget = Decoration.widget(
		0,
		view => {
			const el = document.createElement('div')
			el.style.position = 'relative'
			el.classList.add('rm-first-page-header')

			el.style.width = `calc(100% + ${pageOptions.marginLeft - 1}px + ${
				pageOptions.marginRight - 1
			}px)`
			el.style.marginLeft = `-${pageOptions.marginLeft}px`
			el.style.marginRight = `-${pageOptions.marginRight}px`

			el.style.height = `${pageOptions.pageHeaderHeight}px`
			el.style.overflow = 'hidden'

			let header = null
			if (pageOptions.header && typeof pageOptions.header === 'function') {
				header = pageOptions.header(0, pageCount, view.dom)
			} else {
				header = document.createElement('div')
				// header.classList.add("rm-page-header");
				header.innerHTML = `<span>${(pageOptions.header ?? '').replace(/\{page\}/g, '1').replace(/\{total\}/g, String(pageCount))}</span>`
			}
			el.append(header)
			return el
		},
		{ side: -1 }
	)

	return [pageWidget, firstHeaderWidget] // !isInitial ? [pageWidget, firstHeaderWidget] : [pageWidget];
}

function createIntersDecoration(
	editor: Editor,
	state: EditorState,
	inters: PrefixSumIntersectResult[],
	showDividerDebug: boolean = false
): Decoration[] {
	const breaksDeco: Decoration[] = []

	for (const it of inters) {
		const div = document.createElement('div')
		div.className = 'vdiv-correction'
		div.style.width = '100%'
		div.style.height = '0px'
		div.style.overflow = 'hidden'
		div.style.backgroundColor = 'violet'
		div.className = `rm-inters-${it.nodeIndex}`
		// Insert a decoration immediately before this node
		const widget = Decoration.widget(it.pos, div, {
			side: -1,
		})

		// counter++;
		breaksDeco.push(widget)
	}

	return breaksDeco
}

const pageBreakDefinition = ({
	firstPage = false,
	pageOptions,
	_pageHeaderHeight,
	_pageHeight,
	_pageGap,
	_pageBreakBackground,

	placeholder = false,
	pageIndex = 0,
	numPages = 1,
	dom,
	imIndex,
}: {
	firstPage: boolean
	pageOptions: PaginationPlusOptions
	_pageHeaderHeight: number
	_pageHeight: number
	_pageGap: number
	_pageBreakBackground: string
	placeholder?: boolean
	pageIndex?: number
	numPages?: number
	dom?: HTMLElement
	imIndex: number
}) => {
	const pageContainer = document.createElement('div')
	pageContainer.classList.add('rm-page-break')
	pageContainer.dataset.imIndex = String(imIndex)

	const page = document.createElement('div')
	page.classList.add('page')
	page.style.position = 'relative'
	page.style.float = 'left'
	page.style.clear = 'both'
	page.style.marginTop = firstPage
		? // ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
			`${_pageHeaderHeight + _pageHeight}px`
		: _pageHeight + 'px'

	const pageBreak = document.createElement('div')
	pageBreak.classList.add('breaker')
	pageBreak.style.width = `calc(100% + ${pageOptions.marginLeft - 1}px + ${
		pageOptions.marginRight - 1
	}px)`
	pageBreak.style.marginLeft = `-${pageOptions.marginLeft}px`
	pageBreak.style.marginRight = `-${pageOptions.marginRight}px`
	pageBreak.style.position = 'relative'
	pageBreak.style.float = 'left'
	pageBreak.style.clear = 'both'
	pageBreak.style.left = `0px`
	pageBreak.style.right = `0px`
	pageBreak.style.zIndex = '2'
	// pageBreak.style.backgroundColor = 'green'

	const pageFooter = document.createElement('div')
	pageFooter.classList.add('rm-page-footer')
	pageFooter.style.height = pageOptions.pageFooterHeight + 'px'
	pageFooter.style.overflow = 'hidden'

	if (!placeholder) {
		let footer = null
		if (pageOptions.footer && typeof pageOptions.footer === 'function') {
			footer = pageOptions.footer(pageIndex, numPages, dom, imIndex)
		} else {
			footer = document.createElement('div')
			// footer.classList.add("rm-page-footer");
			footer.innerHTML = `<span>${(pageOptions.footer ?? '').replace(/\{page\}/g, String(pageIndex + 1)).replace(/\{total\}/g, String(numPages))}</span>`
		}
		pageFooter.appendChild(footer)
	}

	const pageSpace = document.createElement('div')
	pageSpace.classList.add('rm-pagination-gap')
	pageSpace.style.height = _pageGap + 'px'
	pageSpace.style.borderLeft = '1px solid'
	pageSpace.style.borderRight = '1px solid'
	pageSpace.style.position = 'relative'
	pageSpace.style.setProperty('width', 'calc(100% + 2px)', 'important')
	pageSpace.style.left = '-1px'
	pageSpace.style.backgroundColor = _pageBreakBackground
	pageSpace.style.borderLeftColor = _pageBreakBackground
	pageSpace.style.borderRightColor = _pageBreakBackground

	const pageHeader = document.createElement('div')
	pageHeader.classList.add('rm-page-header')
	pageHeader.style.height = pageOptions.pageHeaderHeight + 'px'
	pageHeader.style.overflow = 'hidden'

	if (!placeholder) {
		if (pageIndex < numPages) {
			let header = null
			if (pageOptions.header && typeof pageOptions.header === 'function') {
				header = pageOptions.header(pageIndex + 1, numPages, dom, imIndex)
			} else {
				header = document.createElement('div')
				// header.classList.add("rm-page-header");
				header.innerHTML = `<span>${(pageOptions.header ?? '').replace(/\{page\}/g, String(pageIndex + 2)).replace(/\{total\}/g, String(numPages))}</span>`
			}
			pageHeader.append(header)
		}
	}

	pageBreak.append(pageFooter, pageSpace, pageHeader)
	pageContainer.append(page, pageBreak)

	return pageContainer
}

function getDividerPosition(
	bottom: number,
	pageHeightWithGap: number,
	firstHeaderHeight: number
): PageInfo {
	let pageIndex = Math.floor((bottom - firstHeaderHeight) / pageHeightWithGap)
	pageIndex = Math.max(pageIndex, 0)
	return {
		index: pageIndex,
		// TODO: se pageIndex == numPages allora dobbiamo togliere anche firstHeaderHeight e pageGap
		// ma forse posso spostare quella logica dopo
		mt: (pageIndex + 1) * pageHeightWithGap + firstHeaderHeight - bottom,
		cis: -1,
		cie: -1,
	}
}

const emptyPageBreakDefinition = (
	pageOptions: PaginationPlusOptions,
	breakerWidth: number,
	firstPage: boolean
) => {
	const _pageGap = pageOptions.pageGap
	const _pageHeaderHeight =
		pageOptions.pageHeaderHeight +
		pageOptions.contentMarginTop +
		pageOptions.marginTop
	const _pageFooterHeight =
		pageOptions.pageFooterHeight +
		pageOptions.contentMarginBottom +
		pageOptions.marginBottom
	const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight

	return pageBreakDefinition({
		firstPage,
		pageOptions,
		_pageHeaderHeight,
		_pageHeight,
		_pageGap,
		_pageBreakBackground: '#ffffff',
		imIndex: -1
	})
}

function estimatePagesMax(
	editorDom: HTMLElement,
	existing: number,
	PH: number,
	B: number
) {
	let H0 = 0
	const lastElementOfEditor = editorDom.lastElementChild as HTMLElement
	if (lastElementOfEditor) {
		H0 = lastElementOfEditor.offsetTop + lastElementOfEditor.offsetHeight
	}

	// togliamo le pagine già presenti
	H0 -= existing * (PH + B)
	if (H0 < 0) return existing

	return Math.ceil(H0 / (PH - B)) + existing + 1
}

const layoutPages = (
	view: EditorView,
	vdivs: VDivInfo[],
	prefixSumIndex: PrefixSumIndex,
	pageOptions: PaginationPlusOptions,
	lastPageCount: number
) => {
	let t0 = 0
	if (pageOptions.showDividerDebug) t0 = performance.now()

	// L'idea è quella di modificare le altezze dei vdiv-spacer esistenti
	// const storage = store.pplusb as PaginationPlusStorageOptions
	const editorDom = view.dom

	const _pageGap = pageOptions.pageGap
	const _pageHeaderHeight =
		pageOptions.pageHeaderHeight +
		pageOptions.contentMarginTop +
		pageOptions.marginTop
	const _pageFooterHeight =
		pageOptions.pageFooterHeight +
		pageOptions.contentMarginBottom +
		pageOptions.marginBottom
	const _pageContentHeight =
		pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight

	const ABBOND_PAGE = 2
	let mustRecalc: number | false = false

	// Stimiamo il numero di pagine che potrebbero servire;
	// devo essere sicuro di avere più break di pagina del documento
	// quindi preferisco fare una stima largamente in eccesso
	let estimageVDivPageCount = 0
	const pbs = editorDom.querySelectorAll('[data-vdiv]')
	if (pbs.length > 0) {
		mustRecalc = vdivsMustBeRecalculated(pbs, vdivs)
		// stimiamo per eccesso
		estimageVDivPageCount = mustRecalc !== false ? pbs.length - mustRecalc : 0
	}
	if (pbs.length === 0 && vdivs.length > 0) {
		// abbiamo cancellato l'ultimo pageBreak, dobbiamo gestirlo a parte
		// altrimenti non viene "pulito"
		mustRecalc = 0
		vdivs.length = 0
	}

	const paginationElement = editorDom.querySelector('[data-rm-pagination]')
	if (paginationElement) {
		const existing = getExistingPageCount(view)

		// rimuoviamo i breaker da mustRecalc in poi

		// const firstChildIndex =
		// mustRecalc !== false ? (vdivs.length > mustRecalc ? vdivs[mustRecalc].pageIndex : 0) : 0;
		if (mustRecalc !== false) {
			const firstChildIndex =
				vdivs.length > mustRecalc ? vdivs[mustRecalc].pageIndex : 0
			for (let i = firstChildIndex; i < paginationElement.children.length; i++) {
				const pageEl = paginationElement.children[i] as HTMLElement
				if (pageEl.children[1].className === 'vdiv-spacer') {
					// cancelliamo il vdiv
					pageEl.children[1].remove()
					// ripristiniamo l'altezza del div page
					;(pageEl.firstElementChild as HTMLElement).style.marginTop =
						`${_pageContentHeight + (i === 0 ? _pageHeaderHeight : 0)}px`
				}
			}
		}

		// stimiamo per eccesso
		let estimatePageCount = estimatePagesMax(
			view.dom,
			existing,
			_pageContentHeight,
			_pageHeaderHeight + _pageFooterHeight + _pageGap
		)
		estimatePageCount += estimageVDivPageCount + ABBOND_PAGE
		if (estimatePageCount > existing) {
			// aggiungiamo se mancano delle pagine
			const fragment = document.createDocumentFragment()

			for (let i = 0; i < estimatePageCount - existing; i++) {
				// aggiungiamo pagine fake
				fragment.appendChild(
					emptyPageBreakDefinition(
						pageOptions,
						view.dom.clientWidth,
						existing == 0 && i === 0
					)
				)
			}
			paginationElement.append(fragment)
		}

		// calcoliamo i VDivs se ci sono
		if (mustRecalc !== false) {
			calculateVDivsHeight(
				view,
				Array.from(pbs) as HTMLElement[],
				mustRecalc,
				vdivs,
				paginationElement as HTMLElement,
				pageOptions
			)
		}

		// Calcoliamo di quante pagine abbiamo effettivamente bisogno?
		const effectivePageCount = calculatePageCount(view, pageOptions)
		// rimuoviamo i placeholder in più
		const toRemove = estimatePageCount - effectivePageCount
		for (let i = 0; i < toRemove; i++) {
			if (paginationElement.lastElementChild) {
				paginationElement.removeChild(paginationElement.lastElementChild)
			}
		}

		if (vdivs.length > 0) {
			// Se per caso il divider è in fondo alla pagina (appartiene cioè all'ultima pagina)
			// bisogno togliere dall'altezza del divider le dimensioni di PAGEHEADER + GAP
			// perchè non abbiamo altri header dopo questa pagina
			const lastVDiv = vdivs[vdivs.length - 1]
			if (lastVDiv.pageIndex === effectivePageCount - 1) {
				lastVDiv.height -= _pageHeaderHeight + _pageGap
			}
		}

		// costruiamo le intersezioni
		/*
		prefixSumIndex.build(view)
		const inters = prefixSumIndex.findAllFloatIntersections(
			_pageContentHeight,
			_pageHeaderHeight + _pageFooterHeight + _pageGap
		)
		*/		
		const inters = findAllFloatIntersections(
			view, 
			// primo header
			_pageContentHeight,
			_pageHeaderHeight + _pageFooterHeight + _pageGap,
			_pageHeaderHeight,
			// il primo CHILD da considerare è il terzo
			2
		)		
		// const inters:any = []

		// adesso lanciamo i dispatch
		if (effectivePageCount !== lastPageCount) {
			view.dispatch(
				view.state.tr.setMeta(META_PAGEDECOS, {
					pageCount: effectivePageCount,
					vdivRecalcIndex: 0,
					inters,
				})
			)
		} else if (mustRecalc !== false) {
			view.dispatch(
				view.state.tr.setMeta(META_VDIVS, {
					pageCount: lastPageCount,
					vdivRecalcIndex: mustRecalc,
					inters,
				})
			)
		}
		let t1 = 0
		if (pageOptions.showDividerDebug) {
			t1 = performance.now()
			console.log(`LayoutPages: ${t1 - t0} ms`)
		}
	}
}

const calculateVDivsHeight = (
	view: EditorView,
	pbs: HTMLElement[],
	index: number,
	vdivs: VDivInfo[],
	paginationElement: HTMLElement,
	pageOptions: PaginationPlusOptions
) => {
	const _pageGap = pageOptions.pageGap
	const _pageHeaderHeight =
		pageOptions.pageHeaderHeight +
		pageOptions.contentMarginTop +
		pageOptions.marginTop
	const _pageFooterHeight =
		pageOptions.pageFooterHeight +
		pageOptions.contentMarginBottom +
		pageOptions.marginBottom
	const _pageContentHeight =
		pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight

	for (let i = index; i < pbs.length; i++) {
		const pbElement = pbs[i] as HTMLElement

		let height = pbElement.offsetHeight
		let offsetBottom = pbElement.offsetTop + height

		// qui posso gestire height e offsetBottom nel caso di break dentro TABELLE o LISTE
		const wrapperRowOrLi = pbElement.closest('tr, li') as HTMLElement
		if (wrapperRowOrLi) {
			height = wrapperRowOrLi.offsetHeight
			offsetBottom = wrapperRowOrLi.offsetTop + height
		}

		if (pbElement.dataset.vdiv === 'after') {
			const pi = getDividerPosition(
				offsetBottom,
				pageOptions.pageHeight + _pageGap,
				_pageHeaderHeight
			)

			let breakHeight = pi.mt - _pageHeaderHeight - _pageFooterHeight - _pageGap

			if (breakHeight < 0) {
				breakHeight = 1
			}

			vdivs[i] = {
				...vdivs[i],
				height: breakHeight, // + _pageHeaderHeight + _pageFooterHeight + _pageGap,
				lastBottom: offsetBottom,
				pageIndex: pi.index,
			}

			// il divisore non esiste, lo creiamo
			if (paginationElement.children.length <= pi.index) {
				throw new Error('Non dovrebbe succedere')
			}
			const pagChildren = paginationElement.children[pi.index]
			const pagChildrenPage = pagChildren.firstElementChild as HTMLElement
			const defaultMarginTop =
				pi.index === 0
					? _pageContentHeight + _pageHeaderHeight
					: _pageContentHeight
			pagChildrenPage.style.marginTop = `${defaultMarginTop - breakHeight}px`
			// pagChildrenPage.style.marginTop = `${pageOptions.pageHeight + _pageGap - breakHeight}px`;
			const tempDiv = document.createElement('div')
			tempDiv.className = 'vdiv-spacer'
			tempDiv.style.width = '100%'
			tempDiv.style.height = `${breakHeight}px`
			// tempDiv.style.backgroundColor = 'yellow'
			tempDiv.style.position = 'relative'
			tempDiv.style.float = 'left'
			tempDiv.style.clear = 'both'

			pagChildren.insertBefore(tempDiv, pagChildren.lastElementChild)

			// vdiv-spacer
			// controlliamo se la pagina già gestiva un breaker
			/*
      const pageEl = paginationElement.children[pi.index];
      if (!pageEl) {
        throw new Error("non dovrebbe succedere");
      }
      if (pageEl.children[1].className === "vdiv-spacer") {
        // cancelliamo il vdiv
        pageEl.children[1].remove();
        // ripristiniamo l'altezza del div page
        const defaultMarginTop =
          pi.index === 0
            ? _pageContentHeight + _pageHeaderHeight
            : _pageContentHeight;
        (pageEl.firstElementChild as HTMLElement).style.marginTop =
          `${defaultMarginTop}px`;
      }
      */
			/*
      const newPageVDiv = addTempBreakElement(
        pbElement.dataset.bid!,
        breakHeight,
      );
      if (pbElement.nextElementSibling) {
        view.dom.insertBefore(newPageVDiv, pbElement.nextElementSibling);
      } else {
        view.dom.append(
          // addTempBreakElement(pbElement.dataset.bid!, breakHeight)
          newPageVDiv,
        );
      }
      void newPageVDiv.offsetTop;
      */
		}

		if (pbElement.dataset.vdiv === 'before') {
			const pi = getDividerPosition(
				pbElement.offsetTop,
				pageOptions.pageHeight + _pageGap,
				_pageHeaderHeight
			)

			let breakHeight = pi.mt - _pageHeaderHeight - _pageFooterHeight - _pageGap

			if (breakHeight < 0) {
				breakHeight = 1
			}

			vdivs[i] = {
				...vdivs[i],
				height: breakHeight, // + _pageHeaderHeight + _pageFooterHeight + _pageGap,
				lastBottom: pbElement.offsetTop,
				pageIndex: pi.index,
			}

			// il divisore non esiste, lo creiamo
			if (paginationElement.children.length <= pi.index) {
				throw new Error('Non dovrebbe succedere')
			}
			const pagChildren = paginationElement.children[pi.index]
			const pagChildrenPage = pagChildren.firstElementChild as HTMLElement
			const defaultMarginTop =
				pi.index === 0
					? _pageContentHeight + _pageHeaderHeight
					: _pageContentHeight
			pagChildrenPage.style.marginTop = `${defaultMarginTop - breakHeight}px`
			// pagChildrenPage.style.marginTop = `${pageOptions.pageHeight + _pageGap - breakHeight}px`;
			const tempDiv = document.createElement('div')
			tempDiv.className = 'vdiv-spacer'
			tempDiv.style.width = '100%'
			tempDiv.style.height = `${breakHeight}px`
			// tempDiv.style.backgroundColor = 'yellow'
			tempDiv.style.position = 'relative'
			tempDiv.style.float = 'left'
			tempDiv.style.clear = 'both'

			pagChildren.insertBefore(tempDiv, pagChildren.lastElementChild)
			/*
      vdivs[i] = {
        ...vdivs[i],
        height: breakHeight,
        lastBottom: offsetBottom,
        pageIndex: pi.index,
        vdivTop: (pbElement.previousElementSibling as HTMLElement).offsetTop,
      };
      */
		}
	}
}

const refreshPage = (targetNode: HTMLElement) => {
	const paginationElement = targetNode.querySelector('[data-rm-pagination]')
	if (paginationElement) {
		const lastPageBreak = paginationElement.lastElementChild?.querySelector(
			'.breaker'
		) as HTMLElement
		if (lastPageBreak) {
			const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight
			targetNode.style.minHeight = `${minHeight}px`
		}
	}
}
