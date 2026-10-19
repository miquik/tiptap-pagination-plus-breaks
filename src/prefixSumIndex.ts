import { Plugin, PluginKey } from '@tiptap/pm/state'
import { EditorView } from '@tiptap/pm/view'

export interface PrefixSumNodeEntry {
	pos: number
	dom: HTMLElement
}

export interface PrefixSumIntersectResult {
	pos: number
	nodeIndex: number
	floatIndex: number
}

export interface IntersectionResult {
	pos: number
	nodeIndex: number
	floatIndex: number
}

export class PrefixSumIndex {
	private prefixSums: number[] = []
	readonly nodes: PrefixSumNodeEntry[] = []

	build(view: EditorView): void {
		this.nodes.length = 0
		this.prefixSums.length = 0

		let acc = 0
		view.state.doc.forEach((_, offset) => {
			const dom = view.nodeDOM(offset) as HTMLElement | null
			if (!dom) return
			this.nodes.push({ pos: offset, dom })
			acc += dom.offsetHeight
			this.prefixSums.push(acc)
		})
	}

	// Primo nodo il cui prefixSum >= targetY — O(log n)
	findNodeAtY(targetY: number, floatIndex?: number): PrefixSumIntersectResult {
		if (this.nodes.length === 0) throw new RangeError('Cannot search an empty layout index')
		let lo = 0
		let hi = this.prefixSums.length - 1
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if (this.prefixSums[mid] < targetY) lo = mid + 1
			else hi = mid
		}
		return {
			pos: this.nodes[lo].pos,
			nodeIndex: lo,
			floatIndex: floatIndex ?? -1,
		}
	}

	totalHeight(): number {
		return this.prefixSums[this.prefixSums.length - 1] ?? 0
	}

	// Sostituisce i K calls a findNodeAtY — O(n + K)
	findAllFloatIntersections(
		pageHeight: number,
		floatHeight: number
	): PrefixSumIntersectResult[] {
		const result: PrefixSumIntersectResult[] = []
		if (!Number.isFinite(pageHeight) || pageHeight <= 0 || !Number.isFinite(floatHeight) || floatHeight < 0) throw new RangeError('Invalid page dimensions')
		const total = this.totalHeight()

		let floatIndex = 0
		let nodeIndex = 0
		let y = pageHeight // primo float

		while (y < total) {
			// Avanza il puntatore finché non trova il nodo che copre y
			// non riparte mai da 0 — ogni nodo viene visitato al più una volta
			while (
				nodeIndex < this.prefixSums.length - 1 &&
				this.prefixSums[nodeIndex] < y
			) {
				nodeIndex++
			}
			result.push({
				pos: this.nodes[nodeIndex].pos,
				nodeIndex,
				floatIndex,
			})
			y += pageHeight + floatHeight
			floatIndex++
		}

		return result
	}
}

export const findAllFloatIntersections = (
	view: EditorView,
	pageHeight: number,
	floatHeight: number,
	initialHeight: number,
	startChildIndex?: number
): IntersectionResult[] => {
	if (!Number.isFinite(pageHeight) || pageHeight <= 0 || !Number.isFinite(floatHeight) || floatHeight < 0) throw new RangeError('Invalid page dimensions')
	const nodes: Array<{ offset: number; dom: HTMLElement }> = []

	view.state.doc.forEach((_, offset) => {
		const dom = view.nodeDOM(offset) as HTMLElement | null
		if (!dom) return
		nodes.push({ offset, dom })
	})

	const result: IntersectionResult[] = []

	// const last = nodes[nodes.length - 1] ?? null
	// if (!last) return result
	// const total = last.dom.offsetTop + last.dom.offsetHeight
	// const lll = last.dom.getBoundingClientRect()
	const last = view.dom.lastElementChild as HTMLElement
	if (!last || nodes.length === 0) return result
	const total = last.offsetTop + last.offsetHeight

	let floatIndex = 0
	let nodeIndex = 0
	let y = pageHeight + initialHeight

	while (y < total) {
		while (
			nodeIndex < nodes.length &&
			nodes[nodeIndex].dom.offsetTop + nodes[nodeIndex].dom.offsetHeight <= y
		) {
			nodeIndex++
		}

		if (nodeIndex < nodes.length) {
			const { offset, dom } = nodes[nodeIndex]
			// pos: number
			// nodeIndex: number
			// floatIndex: number
			result.push({
				pos: offset,
				nodeIndex: nodeIndex + (startChildIndex ?? 0),
				floatIndex,
			})
			// result.push({ floatY: y, offset, dom });
		}

		y += pageHeight + floatHeight
		floatIndex++
	}

	return result
}
