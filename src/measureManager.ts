type MeasureRequest = {
	key: string
	root: HTMLElement
	onReady: () => void
}

type MeasureManagerOptions = {
	waitForFonts?: boolean
	doubleRaf?: boolean
}

export class MeasureManager {
	private destroyed = false
	private pendingKey: string | null = null
	private raf1: number | null = null
	private raf2: number | null = null

	private watchedImages = new WeakSet<HTMLImageElement>()
	private imageCleanup = new Map<string, () => void>()

	private options: Required<MeasureManagerOptions>

	constructor(options?: MeasureManagerOptions) {
		this.options = {
			waitForFonts: options?.waitForFonts ?? false,
			doubleRaf: options?.doubleRaf ?? false,
		}
	}

	destroy() {
		this.destroyed = true
		this.cancelScheduledFrame()

		for (const cleanup of this.imageCleanup.values()) {
			cleanup()
		}
		this.imageCleanup.clear()
	}

	schedule(req: MeasureRequest) {
		if (this.destroyed) return

		// se sto già aspettando esattamente questo step, non rifaccio nulla
		if (this.pendingKey === req.key) {
			return
		}

		this.pendingKey = req.key

		// pulisco eventuali listener del task precedente
		this.clearImageWaiters()

		this.trySchedule(req)
	}

	private trySchedule(req: MeasureRequest) {
		if (this.destroyed) return
		if (this.pendingKey !== req.key) return

		const pendingImages = this.findPendingImages(req.root)

		if (pendingImages.length > 0) {
			this.waitImages(req, pendingImages)
			return
		}

		if (
			this.options.waitForFonts &&
			typeof document !== 'undefined' &&
			'fonts' in document
		) {
			const fonts = (
				document as Document & {
					fonts?: FontFaceSet
				}
			).fonts

			if (fonts && fonts.status !== 'loaded') {
				fonts.ready
					.then(() => {
						if (this.destroyed) return
						if (this.pendingKey !== req.key) return
						this.scheduleInFrame(req)
					})
					.catch(() => {
						if (this.destroyed) return
						if (this.pendingKey !== req.key) return
						this.scheduleInFrame(req)
					})
				return
			}
		}

		this.scheduleInFrame(req)
	}

	private scheduleInFrame(req: MeasureRequest) {
		this.cancelScheduledFrame()

		this.raf1 = requestAnimationFrame(() => {
			this.raf1 = null

			if (this.destroyed) return
			if (this.pendingKey !== req.key) return

			if (this.options.doubleRaf) {
				this.raf2 = requestAnimationFrame(() => {
					this.raf2 = null
					if (this.destroyed) return
					if (this.pendingKey !== req.key) return

					this.pendingKey = null
					req.onReady()
				})
			} else {
				this.pendingKey = null
				req.onReady()
			}
		})
	}

	private findPendingImages(root: HTMLElement): HTMLImageElement[] {
		const imgs = Array.from(root.querySelectorAll('img'))
		return imgs.filter(img => !this.isImageReady(img))
	}

	private isImageReady(img: HTMLImageElement): boolean {
		// complete=true anche in caso di errore; naturalWidth>0 evita falsi positivi
		return img.complete
	}

	private waitImages(req: MeasureRequest, images: HTMLImageElement[]) {
		const cleanups: Array<() => void> = []

		let remaining = 0
		let released = false

		const release = () => {
			if (released) return
			released = true

			cleanups.forEach(fn => fn())
			this.imageCleanup.delete(req.key)

			if (this.destroyed) return
			if (this.pendingKey !== req.key) return

			this.trySchedule(req)
		}

		for (const img of images) {
			if (this.isImageReady(img)) continue

			remaining++

			const done = () => {
				remaining--
				if (remaining <= 0) {
					release()
				}
			}

			const onLoad = () => done()
			const onError = () => done()

			img.addEventListener('load', onLoad, { once: true })
			img.addEventListener('error', onError, { once: true })

			cleanups.push(() => {
				img.removeEventListener('load', onLoad)
				img.removeEventListener('error', onError)
			})

			this.watchedImages.add(img)
		}

		if (remaining === 0) {
			release()
			return
		}

		this.imageCleanup.set(req.key, () => {
			cleanups.forEach(fn => fn())
		})
	}

	private clearImageWaiters() {
		for (const cleanup of this.imageCleanup.values()) {
			cleanup()
		}
		this.imageCleanup.clear()
	}

	private cancelScheduledFrame() {
		if (this.raf1 != null) {
			cancelAnimationFrame(this.raf1)
			this.raf1 = null
		}
		if (this.raf2 != null) {
			cancelAnimationFrame(this.raf2)
			this.raf2 = null
		}
	}
}
